/**
 * The download engine: a FIFO queue that downloads one item at a time as a forced HLS transcode and saves
 * every part in the download store, so it can play without a network. Lives for the app's lifetime (see Shell).
 */
import type { JellyfinClient } from '../jellyfin/client';
import { artCandidates, imageUrl } from '../jellyfin/art';
import { defaultAudioIndex, listAudio, pickInitialAudio } from '../jellyfin/audio';
import { buildPhoneProfile } from '../jellyfin/phoneProfile';
import { resolveStreamUrl, withAudioStreamIndex, withMaxSize, withNoVideoStreamCopy, withSubtitleStreamIndex } from '../jellyfin/playback';
import { listSubtitles, subtitleVttUrl } from '../jellyfin/subtitles';
import type { BaseItem, MediaSource } from '../jellyfin/types';
import { entryFromItem, isDownloadable, parseIndex, serializeIndex, type DownloadEntry } from './downloadIndex';
import { INDEX_KEY, initKey, itemJsonKey, itemPrefix, metaKey, planKey, playlistKey, posterKey, segmentKey, segmentsJsonKey, subtitleKey } from './downloadKeys';
import * as queue from './downloadQueue';
import { presetFor, type DownloadQuality, type QualityPreset } from './downloadQuality';
import { decideResume, describeDownloadError, HttpError, MAX_RETRIES, PlanError, RESTART_NOTE, retryDelayMs, stripToken } from './downloadResume';
import type { DownloadStore } from './downloadStore';
import type { ScreenLock } from './wakeLock';
import { buildLocalPlaylist, parseMasterPlaylist, parseMediaPlaylist, type Segment } from './hlsPlaylist';

/** The saved playlist of a download in progress. URIs have no access token. */
export interface DownloadPlan {
  initUri: string | null;
  segments: Segment[];
}

export interface SubtitleInfo {
  index: number;
  label: string;
  lang: string;
  isDefault: boolean;
  isForced: boolean;
}

/** `meta.json`: the settings a download needs to be requested again, and what was saved next to the video. */
export interface DownloadMeta {
  entry: DownloadEntry;
  audioStreamIndex: number | null;
  mediaSourceId: string;
  playSessionId: string;
  subtitles: SubtitleInfo[];
}

export interface EngineDeps {
  client: Pick<JellyfinClient, 'serverUrl' | 'playbackInfo' | 'mediaSegments' | 'stopTranscode'>;
  session: { userId: string; token: string };
  deviceId: string;
  store: DownloadStore;
  fetchFn?: typeof fetch;
  isOnline?: () => boolean;
  canPlay?: (mime: string) => boolean;
  /** The audio language remembered by the player (null when never chosen). */
  audioLang?: () => string | null;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  wakeLock?: ScreenLock;
  /** Asks the browser to keep the storage (called when a download starts). */
  requestPersist?: () => void;
  now?: () => Date;
}

/** Index and meta are saved at most this often while segments arrive. */
const SAVE_EVERY = 5;

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });

class RestartSignal extends Error {}

interface Running {
  id: string;
  controller: AbortController;
  promise: Promise<void>;
}

export class DownloadEngine {
  private entries: DownloadEntry[] = [];
  private listeners = new Set<() => void>();
  private started = false;
  /** True once the saved index has been read. */
  ready = false;
  private current: Running | null = null;
  private persisting: Promise<void> = Promise.resolve();
  private persistAsked = false;
  private readonly d: Required<Omit<EngineDeps, 'wakeLock' | 'requestPersist'>> & Pick<EngineDeps, 'wakeLock' | 'requestPersist'>;
  private cleanup: (() => void) | null = null;

  constructor(deps: EngineDeps) {
    this.d = {
      ...deps,
      fetchFn: deps.fetchFn || ((input, init) => fetch(input, init)),
      isOnline: deps.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine !== false),
      canPlay: deps.canPlay || (() => false),
      audioLang: deps.audioLang || (() => null),
      sleep: deps.sleep || defaultSleep,
      now: deps.now || (() => new Date()),
    };
  }

  // ---- state for the UI ----

  getSnapshot = (): DownloadEntry[] => this.entries;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(id: string): DownloadEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  private set(next: DownloadEntry[]): void {
    if (next === this.entries) return;
    this.entries = next;
    this.listeners.forEach((l) => l());
  }

  // ---- lifecycle ----

  /** Loads the index, puts interrupted downloads back in the queue and continues when online. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const saved = await this.d.store.get(INDEX_KEY);
    const loaded = saved ? parseIndex(await saved.text()) : [];
    if (!this.started) return;
    // Anything enqueued while loading stays after the saved ones.
    const merged = this.entries.reduce((list, e) => queue.enqueue(list, e), loaded);
    this.ready = true;
    this.set(queue.recoverAfterStart(merged));
    this.listeners.forEach((l) => l());
    await this.persist();
    const kick = () => void this.pump();
    // Continue the queue when the connection is back or the app is shown again.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') kick();
      };
      window.addEventListener('online', kick);
      document.addEventListener('visibilitychange', onVisible);
      this.cleanup = () => {
        window.removeEventListener('online', kick);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    kick();
  }

  /** Stops the engine (signing out): the running download goes back to the queue. */
  stop(): void {
    this.started = false;
    if (this.cleanup) this.cleanup();
    this.cleanup = null;
    if (this.current) this.current.controller.abort();
    if (this.d.wakeLock) this.d.wakeLock.release();
  }

  // ---- actions ----

  /** Adds movies and episodes to the queue (items that already have a download are skipped). */
  async enqueue(items: BaseItem[], quality: DownloadQuality): Promise<void> {
    const added: BaseItem[] = [];
    let next = this.entries;
    for (const item of items) {
      if (!isDownloadable(item)) continue;
      const before = next;
      next = queue.enqueue(next, entryFromItem(item, quality, this.d.now().toISOString()));
      if (next !== before) added.push(item);
    }
    if (added.length === 0) return;
    this.set(next);
    for (const item of added) await this.d.store.put(itemJsonKey(item.Id), JSON.stringify(item), 'application/json');
    await this.persist();
    // The pictures are small: fetch them now so the list has them while the item waits in line.
    for (const item of added) void this.savePoster(item.Id, item, new AbortController().signal).catch(() => undefined);
    void this.pump();
  }

  pause(id: string): void {
    const wasRunning = this.current && this.current.id === id;
    this.set(queue.pause(this.entries, id));
    void this.persist();
    if (wasRunning && this.current) this.current.controller.abort();
  }

  resume(id: string): void {
    this.set(queue.resume(this.entries, id));
    void this.persist();
    void this.pump();
  }

  retry(id: string): void {
    this.set(queue.retry(this.entries, id));
    void this.persist();
    void this.pump();
  }

  /** Cancels or removes one download and everything saved for it. */
  async remove(id: string): Promise<void> {
    await this.stopRunning(id);
    await this.d.store.deletePrefix(itemPrefix(id));
    this.set(queue.remove(this.entries, id));
    await this.persist();
    void this.pump();
  }

  async removeAll(): Promise<void> {
    for (const e of this.entries.slice()) await this.remove(e.id);
  }

  private async stopRunning(id: string): Promise<void> {
    const run = this.current;
    if (!run || run.id !== id) return;
    // Mark it paused so the aborted run does not put it back in the queue, then wait until it has stopped writing.
    this.set(queue.patchEntry(this.entries, id, { state: 'paused' }));
    run.controller.abort();
    await run.promise;
  }

  // ---- the queue ----

  private pump(): Promise<void> {
    if (!this.started || this.current || !this.d.isOnline()) return Promise.resolve();
    const next = queue.nextToRun(this.entries);
    if (!next) {
      if (this.d.wakeLock) this.d.wakeLock.release();
      return Promise.resolve();
    }
    const controller = new AbortController();
    this.set(queue.start(this.entries, next.id));
    if (this.d.wakeLock) this.d.wakeLock.acquire();
    if (!this.persistAsked && this.d.requestPersist) {
      this.persistAsked = true;
      this.d.requestPersist();
    }
    const promise = this.run(next.id, controller.signal).then(
      () => undefined,
      () => undefined,
    );
    const running: Running = { id: next.id, controller, promise };
    this.current = running;
    return promise.then(() => {
      if (this.current === running) this.current = null;
      return this.pump();
    });
  }

  /** Runs one item and records how it ended. Never throws. */
  private async run(id: string, signal: AbortSignal): Promise<void> {
    try {
      await this.download(id, signal);
      return;
    } catch (e) {
      const entry = this.get(id);
      if (!entry) return;
      if (signal.aborted) {
        // Paused or removed: the state is already set. Stopped by the app closing: back in the queue.
        if (entry.state === 'downloading') this.set(queue.requeue(this.entries, id, ''));
      } else if (!this.d.isOnline()) {
        this.set(queue.requeue(this.entries, id, 'Waiting for a connection.'));
      } else {
        this.set(queue.fail(this.entries, id, describeDownloadError(e)));
      }
    }
    await this.save(id).catch(() => undefined);
  }

  // ---- one download ----

  private async download(id: string, signal: AbortSignal): Promise<void> {
    const preset = presetFor((this.get(id) as DownloadEntry).quality);
    let meta = await this.readJson<DownloadMeta>(metaKey(id));
    let plan = await this.readJson<DownloadPlan>(planKey(id));
    // The plan was asked for in this run, so its links are fresh.
    let fresh = false;
    if (!meta || !plan) {
      const prepared = await this.prepare(id, preset, signal);
      meta = prepared.meta;
      plan = prepared.plan;
      fresh = true;
    }
    this.set(queue.patchEntry(this.entries, id, { segmentsTotal: plan.segments.length }));

    const ctx = { meta, plan, fresh };
    for (;;) {
      try {
        await this.fetchAll(id, preset, ctx, signal);
        break;
      } catch (e) {
        if (!(e instanceof RestartSignal)) throw e;
        // fetchAll already stored the new plan and cleared the saved parts.
      }
    }
    await this.finish(id, ctx.plan, ctx.meta, signal);
  }

  /** First start of an item: save the small things, then ask the server for the video. */
  private async prepare(id: string, preset: QualityPreset, signal: AbortSignal): Promise<{ meta: DownloadMeta; plan: DownloadPlan }> {
    const { client, session, store } = this.d;
    const entry = this.get(id) as DownloadEntry;
    let audio: number | null = null;
    let { source, playSessionId } = await this.requestInfo(id, preset, null);
    // Like the player: when the remembered audio language is not the default one, ask again for that track.
    const want = pickInitialAudio(listAudio(source), this.d.audioLang());
    if (want !== null) {
      audio = want;
      ({ source, playSessionId } = await this.requestInfo(id, preset, want));
    } else {
      const def = defaultAudioIndex(listAudio(source));
      audio = def;
    }
    this.throwIfAborted(signal);

    // Small things first: the item, its picture, text subtitles and the intro markers.
    const item = await this.readJson<BaseItem>(itemJsonKey(id));
    if (item && !(await store.has(posterKey(id)))) await this.savePoster(id, item, signal);
    const subtitles: SubtitleInfo[] = [];
    for (const track of listSubtitles(source)) {
      if (track.burnIn) continue;
      try {
        const res = await this.d.fetchFn(subtitleVttUrl(client.serverUrl, id, source.Id, track.index, session.token), { signal });
        if (!res.ok) continue;
        await store.put(subtitleKey(id, track.index), await res.text(), 'text/vtt');
        subtitles.push({ index: track.index, label: track.label, lang: track.lang, isDefault: track.isDefault, isForced: track.isForced });
      } catch (e) {
        this.throwIfAborted(signal);
      }
    }
    try {
      await store.put(segmentsJsonKey(id), JSON.stringify(await client.mediaSegments(id)), 'application/json');
    } catch (e) {
      this.throwIfAborted(signal);
    }
    this.throwIfAborted(signal);

    const plan = await this.loadPlan(source, preset, audio, signal);
    const meta: DownloadMeta = { entry, audioStreamIndex: audio, mediaSourceId: source.Id, playSessionId: playSessionId || '', subtitles };
    await store.put(planKey(id), JSON.stringify(plan), 'application/json');
    await store.put(metaKey(id), JSON.stringify(meta), 'application/json');
    return { meta, plan };
  }

  private async savePoster(id: string, item: BaseItem, signal: AbortSignal): Promise<void> {
    // The list shows a poster for movies and a 16:9 still for episodes.
    const episode = item.Type === 'Episode';
    const [kind, w, h] = episode ? (['thumb', 320, 180] as const) : (['poster', 240, 360] as const);
    for (const art of artCandidates(item, kind)) {
      try {
        const res = await this.d.fetchFn(imageUrl(this.d.client.serverUrl, art, w, h), { signal });
        if (!res.ok) continue;
        const blob = await res.blob();
        await this.d.store.put(posterKey(id), blob, res.headers.get('Content-Type') || 'image/jpeg');
        return;
      } catch (e) {
        this.throwIfAborted(signal);
      }
    }
  }

  /** Asks the server for a forced transcode of the item (no direct play, no burned-in subtitles). */
  private async requestInfo(id: string, preset: QualityPreset, audio: number | null): Promise<{ source: MediaSource; playSessionId?: string }> {
    const profile = buildPhoneProfile(this.d.canPlay, preset.bitrate, { height: preset.maxHeight, width: preset.maxWidth });
    const info = await this.d.client.playbackInfo(this.d.session.userId, id, profile, {
      directPlay: false,
      directStream: false,
      subtitleStreamIndex: -1,
      audioStreamIndex: audio === null ? undefined : audio,
    });
    const source = info.MediaSources[0];
    if (!source || !source.TranscodingUrl) throw new PlanError('The server could not prepare this video for download.');
    return { source, playSessionId: info.PlaySessionId };
  }

  private async fetchChecked(url: string, what: string, signal: AbortSignal): Promise<Response> {
    const res = await this.d.fetchFn(url, { signal });
    if (!res.ok) throw new HttpError(res.status, what);
    return res;
  }

  /** The master playlist, then the first variant's media playlist. */
  private async loadPlan(source: MediaSource, preset: QualityPreset, audio: number | null, signal: AbortSignal): Promise<DownloadPlan> {
    const { client, session } = this.d;
    let url = withMaxSize(withNoVideoStreamCopy(withSubtitleStreamIndex(source.TranscodingUrl as string, -1)), preset.maxHeight, preset.maxWidth);
    if (audio !== null) url = withAudioStreamIndex(url, audio);
    const masterUrl = resolveStreamUrl(client.serverUrl, url, session.token);
    const variants = parseMasterPlaylist(await (await this.fetchChecked(masterUrl, 'Master playlist', signal)).text(), masterUrl);
    if (variants.length === 0) throw new PlanError('The server sent no video stream to download.');
    const mediaUrl = resolveStreamUrl(client.serverUrl, variants[0], session.token);
    const media = parseMediaPlaylist(await (await this.fetchChecked(mediaUrl, 'Media playlist', signal)).text(), mediaUrl);
    if (media.segments.length === 0) throw new PlanError('The server sent an empty video to download.');
    return {
      initUri: media.initUri ? stripToken(media.initUri) : null,
      segments: media.segments.map((s) => ({ duration: s.duration, uri: stripToken(s.uri) })),
    };
  }

  /** Downloads the init segment and every segment from `segmentsDone` on. */
  private async fetchAll(id: string, preset: QualityPreset, ctx: { meta: DownloadMeta; plan: DownloadPlan; fresh: boolean }, signal: AbortSignal): Promise<void> {
    const { store } = this.d;
    if (ctx.plan.initUri && !(await store.has(initKey(id)))) {
      const data = await this.fetchPart(id, preset, ctx, -1, signal);
      this.throwIfAborted(signal);
      await store.put(initKey(id), data, 'video/mp4');
    }
    let bytes = (this.get(id) as DownloadEntry).bytes;
    let i = (this.get(id) as DownloadEntry).segmentsDone;
    while (i < ctx.plan.segments.length) {
      this.throwIfAborted(signal);
      const data = await this.fetchPart(id, preset, ctx, i, signal);
      this.throwIfAborted(signal);
      await store.put(segmentKey(id, i), data, 'application/octet-stream');
      i++;
      bytes += data.byteLength;
      this.set(queue.progress(this.entries, id, i, ctx.plan.segments.length, bytes));
      if (i % SAVE_EVERY === 0) await this.save(id, ctx.meta);
    }
  }

  /**
   * One part (the init segment for index -1). A failure is retried with backoff. When the saved link of a
   * resumed download stops working, the playlist is requested again once (see decideResume).
   */
  private async fetchPart(id: string, preset: QualityPreset, ctx: { meta: DownloadMeta; plan: DownloadPlan; fresh: boolean }, index: number, signal: AbortSignal): Promise<ArrayBuffer> {
    let attempt = 0;
    for (;;) {
      const uri = index < 0 ? (ctx.plan.initUri as string) : ctx.plan.segments[index].uri;
      try {
        const url = resolveStreamUrl(this.d.client.serverUrl, uri, this.d.session.token);
        return await (await this.fetchChecked(url, index < 0 ? 'Init segment' : `Segment ${index + 1}`, signal)).arrayBuffer();
      } catch (e) {
        this.throwIfAborted(signal);
        if (!ctx.fresh) {
          ctx.fresh = true;
          await this.refreshPlan(id, preset, ctx, signal);
          continue;
        }
        attempt++;
        if (attempt > MAX_RETRIES) throw e;
        await this.d.sleep(retryDelayMs(attempt), signal);
        this.throwIfAborted(signal);
      }
    }
  }

  /** Requests the playlist again with the saved settings; continues when the segment count matches, else starts over. */
  private async refreshPlan(id: string, preset: QualityPreset, ctx: { meta: DownloadMeta; plan: DownloadPlan }, signal: AbortSignal): Promise<void> {
    const { source, playSessionId } = await this.requestInfo(id, preset, ctx.meta.audioStreamIndex);
    const plan = await this.loadPlan(source, preset, ctx.meta.audioStreamIndex, signal);
    const entry = this.get(id) as DownloadEntry;
    const decision = decideResume(ctx.plan.segments.length, plan.segments.length, entry.segmentsDone);
    if (decision.action === 'fail') throw new PlanError('The server sent an empty video to download.');
    ctx.meta = { ...ctx.meta, mediaSourceId: source.Id, playSessionId: playSessionId || ctx.meta.playSessionId };
    ctx.plan = plan;
    await this.d.store.put(planKey(id), JSON.stringify(plan), 'application/json');
    await this.d.store.put(metaKey(id), JSON.stringify(ctx.meta), 'application/json');
    if (decision.action === 'restart') {
      await this.clearParts(id);
      this.set(queue.patchEntry(this.entries, id, { segmentsDone: 0, segmentsTotal: plan.segments.length, bytes: 0, error: RESTART_NOTE }));
      throw new RestartSignal();
    }
  }

  /** Removes the saved init segment and segments (the small files stay). */
  private async clearParts(id: string): Promise<void> {
    await this.d.store.deletePrefix(initKey(id));
    await this.d.store.deletePrefix(`${itemPrefix(id)}seg-`);
  }

  /** All parts are in: write the playlist, mark the item done and let the server stop its transcode. */
  private async finish(id: string, plan: DownloadPlan, meta: DownloadMeta, signal: AbortSignal): Promise<void> {
    const { store } = this.d;
    this.throwIfAborted(signal);
    const playlist = buildLocalPlaylist(
      plan.segments.map((s, n) => ({ duration: s.duration, uri: `seg-${n}` })),
      plan.initUri ? 'init' : null,
    );
    await store.put(playlistKey(id), playlist, 'application/vnd.apple.mpegurl');
    const bytes = (this.get(id) as DownloadEntry).bytes;
    this.set(queue.complete(this.entries, id, bytes));
    await store.deletePrefix(planKey(id));
    await this.save(id, meta);
    this.d.client.stopTranscode(this.d.deviceId, meta.playSessionId).catch(() => undefined);
  }

  // ---- saving ----

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Download stopped', 'AbortError');
  }

  private async readJson<T>(key: string): Promise<T | null> {
    try {
      const res = await this.d.store.get(key);
      return res ? ((await res.json()) as T) : null;
    } catch (e) {
      return null;
    }
  }

  /** Writes the index, and the item's meta when it is given or already saved. Writes are queued, so they never overlap. */
  private async save(id: string, meta?: DownloadMeta): Promise<void> {
    const entry = this.get(id);
    const current = meta || (await this.readJson<DownloadMeta>(metaKey(id)));
    if (entry && current) await this.d.store.put(metaKey(id), JSON.stringify({ ...current, entry }), 'application/json');
    await this.persist();
  }

  private persist(): Promise<void> {
    const write = () => this.d.store.put(INDEX_KEY, serializeIndex(this.entries), 'application/json');
    this.persisting = this.persisting.then(write, write);
    return this.persisting.catch(() => undefined);
  }
}
