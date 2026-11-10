import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { useApp } from '../context';
import { buildPhoneProfile } from '../jellyfin/phoneProfile';
import { resolveStreamUrl, withNoVideoStreamCopy } from '../jellyfin/playback';
import type { BaseItem } from '../jellyfin/types';
import { OFFLINE_CACHE, CacheLoader } from '../offline/cacheLoader';
import { buildLocalPlaylist, parseMasterPlaylist, parseMediaPlaylist, resolveUri, trimSegments } from '../offline/hlsPlaylist';
import { startGapTarget } from '../offline/startGap';

const SECONDS = 120;
const keyBase = (itemId: string) => `./offline-test/${encodeURIComponent(itemId)}/`;
const keyUrl = (key: string) => new URL(key, window.location.href).href;

interface Meta {
  itemId: string;
  name: string;
  segments: number;
  bytes: number;
  date: string;
}

interface Diag {
  standalone: boolean;
  secure: boolean;
  caches: boolean;
  opfs: boolean;
  managedMediaSource: boolean;
  mediaSource: boolean;
  hls: boolean | null;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

const size = (bytes: number | null): string => {
  if (bytes === null) return 'unknown';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
};
const yesNo = (v: boolean | null): string => (v === null ? 'unknown' : v ? 'yes' : 'no');
const fmt = (n: number): string => n.toFixed(2).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));
const bufferedRanges = (el: HTMLVideoElement): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < el.buffered.length; i++) out.push([el.buffered.start(i), el.buffered.end(i)]);
  return out;
};
const statusLine = (el: HTMLVideoElement): string => {
  const ranges = bufferedRanges(el);
  const buffered = ranges.length === 0 ? 'none' : ranges.map(([a, b]) => `${fmt(a)}-${fmt(b)}`).join(', ');
  return `time ${el.currentTime.toFixed(2)} \u00b7 buffered ${buffered}`;
};
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function readDiagnostics(): Promise<Diag> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const storage = navigator.storage as StorageManager | undefined;
  let hls: boolean | null = null;
  try {
    hls = (await import('hls.js')).default.isSupported();
  } catch {
    hls = null;
  }
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    if (storage && storage.estimate) {
      const est = await storage.estimate();
      usage = est.usage ?? null;
      quota = est.quota ?? null;
    }
  } catch {
    // not available
  }
  try {
    if (storage && storage.persisted) persisted = await storage.persisted();
  } catch {
    // not available
  }
  return {
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    secure: window.isSecureContext,
    caches: 'caches' in window,
    opfs: !!(storage && storage.getDirectory),
    managedMediaSource: 'ManagedMediaSource' in window,
    mediaSource: 'MediaSource' in window,
    hls,
    usage,
    quota,
    persisted,
  };
}

async function listSaved(): Promise<Meta[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(OFFLINE_CACHE);
  const out: Meta[] = [];
  for (const request of await cache.keys()) {
    if (!request.url.endsWith('/meta.json')) continue;
    const response = await cache.match(request);
    if (response) out.push((await response.json()) as Meta);
  }
  return out;
}

async function fetchChecked(url: string, step: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error(`${step}: network error (${message(e)})`);
  }
  if (!response.ok) throw new Error(`${step}: HTTP ${response.status}`);
  return response;
}

/** Temporary page that tests downloading a video into browser storage and playing it back without a network. */
export function OfflineTest({ onBack }: { onBack: () => void }) {
  const { client, session } = useApp();
  const [diag, setDiag] = useState<Diag | null>(null);
  const [persistResult, setPersistResult] = useState('');
  const [text, setText] = useState('');
  const [results, setResults] = useState<BaseItem[]>([]);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<BaseItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Meta[]>([]);
  const [playing, setPlaying] = useState('');
  const [playError, setPlayError] = useState('');
  const [status, setStatus] = useState('');
  const unlisten = useRef<(() => void) | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy(): void } | null>(null);
  const alive = useRef(true);

  const refreshDiag = () => void readDiagnostics().then((d) => alive.current && setDiag(d));
  const refreshSaved = () =>
    void listSaved()
      .then((list) => alive.current && setSaved(list))
      .catch((e) => alive.current && setError(`Could not read saved downloads: ${message(e)}`));

  useEffect(() => {
    alive.current = true;
    refreshDiag();
    refreshSaved();
    return () => {
      alive.current = false;
      if (hlsRef.current) hlsRef.current.destroy();
      if (unlisten.current) unlisten.current();
    };
  }, []);

  useEffect(() => {
    const term = text.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      if (navigator.onLine === false) {
        setSearchError('Search needs a connection. Saved downloads below still play.');
        return;
      }
      client
        .search(session.userId, term, 20)
        .then((items) => {
          if (!alive.current) return;
          setSearchError('');
          setResults(items.filter((i) => i.Type === 'Movie' || i.Type === 'Episode'));
        })
        .catch((e) => alive.current && setSearchError(`Search failed: ${message(e)}`));
    }, 300);
    return () => clearTimeout(id);
  }, [text, client, session.userId]);

  const keep = async () => {
    const storage = navigator.storage as StorageManager | undefined;
    if (!storage || !storage.persist) {
      setPersistResult('Not supported');
    } else {
      try {
        setPersistResult((await storage.persist()) ? 'Granted' : 'Refused');
      } catch (e) {
        setPersistResult(`Failed: ${message(e)}`);
      }
    }
    refreshDiag();
  };

  const download = async (item: BaseItem) => {
    setBusy(true);
    setError('');
    setProgress('Asking the server for a transcode...');
    let step = 'Start';
    try {
      if (!('caches' in window)) throw new Error('The Cache API is not available here');
      const probe = document.createElement('video');
      const profile = buildPhoneProfile((mime) => probe.canPlayType(mime) !== '', 3_000_000, { height: 720, width: 1280 });
      step = 'Playback info';
      const info = await client.playbackInfo(session.userId, item.Id, profile, {
        directPlay: false,
        directStream: false,
        subtitleStreamIndex: -1,
      });
      const source = info.MediaSources[0];
      if (!source || !source.TranscodingUrl) throw new Error('Playback info: the server offered no transcode (no TranscodingUrl)');
      const masterUrl = resolveStreamUrl(client.serverUrl, withNoVideoStreamCopy(source.TranscodingUrl), session.token);

      step = 'Master playlist';
      const master = await (await fetchChecked(masterUrl, step)).text();
      const variants = parseMasterPlaylist(master, masterUrl);
      if (variants.length === 0) throw new Error('Master playlist: no variant found');
      const mediaUrl = resolveStreamUrl(client.serverUrl, variants[0], session.token);

      step = 'Media playlist';
      const media = parseMediaPlaylist(await (await fetchChecked(mediaUrl, step)).text(), mediaUrl);
      const segments = trimSegments(media.segments, SECONDS);
      if (segments.length === 0) throw new Error('Media playlist: no segments found');

      const cache = await caches.open(OFFLINE_CACHE);
      const base = keyBase(item.Id);
      let bytes = 0;
      const put = async (key: string, data: ArrayBuffer | string, type: string) => {
        await cache.put(new Request(keyUrl(key)), new Response(data, { headers: { 'Content-Type': type } }));
      };
      const total = segments.length + (media.initUri ? 1 : 0);
      let done = 0;
      const report = () => setProgress(`Downloaded ${done} of ${total} parts, ${size(bytes)}`);

      if (media.initUri) {
        step = 'Init segment';
        const data = await (await fetchChecked(resolveStreamUrl(client.serverUrl, media.initUri, session.token), step)).arrayBuffer();
        step = 'Saving init segment';
        await put(`${base}init`, data, 'video/mp4');
        bytes += data.byteLength;
        done++;
        report();
      }
      for (let i = 0; i < segments.length; i++) {
        step = `Segment ${i + 1}`;
        const data = await (await fetchChecked(resolveStreamUrl(client.serverUrl, segments[i].uri, session.token), step)).arrayBuffer();
        step = `Saving segment ${i + 1}`;
        await put(`${base}seg-${i}`, data, 'application/octet-stream');
        bytes += data.byteLength;
        done++;
        report();
        if (!alive.current) return;
      }

      step = 'Saving playlist';
      const playlist = buildLocalPlaylist(
        segments.map((s, i) => ({ duration: s.duration, uri: `seg-${i}` })),
        media.initUri ? 'init' : null,
      );
      await put(`${base}index.m3u8`, playlist, 'application/vnd.apple.mpegurl');
      const meta: Meta = { itemId: item.Id, name: item.Name, segments: segments.length, bytes, date: new Date().toISOString() };
      await put(`${base}meta.json`, JSON.stringify(meta), 'application/json');
      if (!alive.current) return;
      setProgress(`Done: ${segments.length} segments, ${size(bytes)}`);
      refreshSaved();
      refreshDiag();
    } catch (e) {
      if (!alive.current) return;
      setProgress('');
      setError(`${step} failed. ${message(e)}`);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const stop = () => {
    if (hlsRef.current) hlsRef.current.destroy();
    hlsRef.current = null;
    if (unlisten.current) unlisten.current();
    unlisten.current = null;
  };

  const play = async (meta: Meta) => {
    const el = video.current;
    if (!el) return;
    stop();
    setPlayError('');
    setStatus('');
    setPlaying(meta.name);
    try {
      const { default: Hls } = await import('hls.js');
      if (!Hls.isSupported()) throw new Error('hls.js is not supported in this browser');
      el.disableRemotePlayback = true;
      const hls = new Hls({ loader: CacheLoader, maxBufferHole: 0.5 });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (alive.current) setPlayError(`${data.fatal ? 'Fatal' : 'Non-fatal'} hls.js error: ${data.type} / ${data.details}${data.reason ? ` (${data.reason})` : ''}`);
      });
      hls.loadSource(resolveUri(window.location.href, `${keyBase(meta.itemId)}index.m3u8`));
      hls.attachMedia(el);

      // The transcode's buffered media can start slightly after 0; jump that gap until playback has started.
      let started = false;
      const jumpGap = () => {
        if (started) return;
        const target = startGapTarget(el.currentTime, bufferedRanges(el));
        if (target === null) return;
        el.currentTime = target;
        void el.play().catch(() => undefined);
      };
      const refreshStatus = () => alive.current && setStatus(statusLine(el));
      const onTimeUpdate = () => {
        const ranges = bufferedRanges(el);
        if (ranges.length > 0 && el.currentTime > ranges[0][0]) started = true;
        refreshStatus();
      };
      const onPlaying = () => {
        started = true;
        if (alive.current) setPlayError('');
        refreshStatus();
      };
      const onLoaded = () => {
        void el.play().catch(() => undefined);
        jumpGap();
      };
      const listeners: Array<[string, () => void]> = [
        ['loadedmetadata', onLoaded],
        ['canplay', jumpGap],
        ['timeupdate', onTimeUpdate],
        ['progress', refreshStatus],
        ['waiting', refreshStatus],
        ['playing', onPlaying],
      ];
      for (const [name, fn] of listeners) el.addEventListener(name, fn);
      unlisten.current = () => {
        for (const [name, fn] of listeners) el.removeEventListener(name, fn);
      };
      hls.on(Hls.Events.FRAG_BUFFERED, jumpGap);
    } catch (e) {
      setPlayError(`Playback failed. ${message(e)}`);
    }
  };

  const remove = async (meta: Meta) => {
    try {
      const cache = await caches.open(OFFLINE_CACHE);
      const prefix = keyUrl(keyBase(meta.itemId));
      for (const request of await cache.keys()) if (request.url.startsWith(prefix)) await cache.delete(request);
      if (playing === meta.name) {
        stop();
        setPlaying('');
      }
    } catch (e) {
      setError(`Delete failed. ${message(e)}`);
    }
    refreshSaved();
    refreshDiag();
  };

  const rows: Array<[string, string]> = diag
    ? [
        ['Home-screen app', yesNo(diag.standalone)],
        ['Secure context (https)', yesNo(diag.secure)],
        ['Cache API', yesNo(diag.caches)],
        ['OPFS file storage', yesNo(diag.opfs)],
        ['ManagedMediaSource', yesNo(diag.managedMediaSource)],
        ['MediaSource', yesNo(diag.mediaSource)],
        ['hls.js supported', yesNo(diag.hls)],
        ['Storage used', size(diag.usage)],
        ['Storage allowed', size(diag.quota)],
        ['Kept (persistent)', yesNo(diag.persisted)],
      ]
    : [];

  return (
    <main class="offline-test">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" size={26} />
      </button>
      <h1>Offline download test</h1>
      <p class="hint small">Temporary page. It saves the first 2 minutes of a video on this device and plays it back without the network.</p>

      <h2>This device</h2>
      {diag && !diag.secure ? <p class="warn">Open the app from its https address, storage does not work over http.</p> : null}
      <ul>
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <span>{value}</span>
          </li>
        ))}
      </ul>
      <button type="button" class="btn secondary" onClick={() => void keep()}>
        Keep downloads
      </button>
      {persistResult ? <p class="hint small">Keep downloads: {persistResult}</p> : null}

      <h2>Pick something</h2>
      <input
        type="search"
        placeholder="Search a movie or episode"
        autoCapitalize="none"
        autoCorrect="off"
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        aria-label="Search"
      />
      {searchError ? <p class="warn">{searchError}</p> : null}
      <ul>
        {results.map((item) => (
          <li key={item.Id}>
            <button type="button" class={selected && selected.Id === item.Id ? 'pick selected' : 'pick'} onClick={() => setSelected(item)}>
              {item.SeriesName ? `${item.SeriesName}: ` : ''}
              {item.Name}
            </button>
          </li>
        ))}
      </ul>
      {selected ? <p class="hint small">Selected: {selected.Name}</p> : null}
      <button type="button" class="btn primary" disabled={!selected || busy} onClick={() => selected && void download(selected)}>
        {busy ? 'Downloading...' : 'Download 2 minutes'}
      </button>
      {progress ? <p class="hint small" role="status">{progress}</p> : null}
      {error ? <p class="warn" role="alert">{error}</p> : null}

      <h2>Saved test downloads</h2>
      {saved.length === 0 ? <p class="hint small">Nothing saved yet.</p> : null}
      <ul>
        {saved.map((meta) => (
          <li key={meta.itemId}>
            <span>
              {meta.name}
              <br />
              {size(meta.bytes)}, {new Date(meta.date).toLocaleString()}
            </span>
            <span class="actions">
              <button type="button" class="btn secondary" onClick={() => void play(meta)}>
                Play offline
              </button>
              <button type="button" class="btn danger" onClick={() => void remove(meta)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <video ref={video} playsInline controls hidden={!playing} />
      {playing ? <p class="hint small">Playing from storage: {playing}</p> : null}
      {playError ? <p class="warn" role="alert">{playError}</p> : null}
      {playing && status ? <p class="hint small">{status}</p> : null}
    </main>
  );
}
