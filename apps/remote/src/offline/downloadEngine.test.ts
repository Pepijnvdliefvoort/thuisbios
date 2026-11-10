import { describe, expect, it, vi } from 'vitest';
import type { BaseItem, MediaSource } from '../jellyfin/types';
import { DownloadEngine, type DownloadMeta, type DownloadPlan, type EngineDeps } from './downloadEngine';
import { entryFromItem, parseIndex, serializeIndex } from './downloadIndex';
import { INDEX_KEY, initKey, itemJsonKey, metaKey, planKey, playlistKey, segmentKey } from './downloadKeys';
import type { DownloadStore } from './downloadStore';

function memoryStore() {
  const data = new Map<string, { body: ArrayBuffer | Blob | string; type: string }>();
  const store: DownloadStore = {
    async put(key, body, type) {
      data.set(key, { body, type });
    },
    async get(key) {
      const hit = data.get(key);
      return hit ? new Response(hit.body as BodyInit) : undefined;
    },
    async has(key) {
      return data.has(key);
    },
    async deletePrefix(prefix) {
      for (const k of Array.from(data.keys())) if (k.startsWith(prefix)) data.delete(k);
    },
  };
  return { data, store };
}

const movie: BaseItem = { Id: 'm1', Name: 'Sample Film 01', Type: 'Movie', RunTimeTicks: 600_000_000 };

/** A server that offers a transcode of `count` segments; `reject` makes some segment requests fail. */
function fakeServer(count: number, opts: { fail?: (url: string) => number | null } = {}) {
  const calls: string[] = [];
  const source: MediaSource = {
    Id: 'src1',
    TranscodingUrl: '/videos/m1/master.m3u8?DeviceId=dev&PlaySessionId=p1',
    MediaStreams: [
      { Type: 'Audio', Index: 1, Language: 'eng', IsDefault: true },
      { Type: 'Subtitle', Index: 2, Language: 'eng', IsTextSubtitleStream: true },
      { Type: 'Subtitle', Index: 3, Language: 'fra', IsTextSubtitleStream: false },
    ],
  };
  let n = count;
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const status = opts.fail ? opts.fail(url) : null;
    if (status) return new Response('', { status });
    if (url.includes('master.m3u8')) return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8?x=1\n');
    if (url.includes('main.m3u8')) {
      const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:6'];
      for (let i = 0; i < n; i++) lines.push('#EXTINF:6.000,', `hls1/main/${i}.ts`);
      lines.push('#EXT-X-ENDLIST');
      return new Response(lines.join('\n'));
    }
    if (url.includes('/Subtitles/')) return new Response('WEBVTT\n');
    if (url.includes('/Images/')) return new Response('', { status: 404 });
    return new Response(new Uint8Array(100));
  });
  const client = {
    serverUrl: 'http://pc:8096',
    playbackInfo: vi.fn(async () => ({ MediaSources: [source], PlaySessionId: 'p1' })),
    mediaSegments: vi.fn(async () => [{ type: 'Intro' as const, startTicks: 1, endTicks: 9 }]),
    stopTranscode: vi.fn(async () => undefined),
  };
  return { calls, fetchFn, client, setCount: (c: number) => (n = c) };
}

function makeEngine(server: ReturnType<typeof fakeServer>, store: DownloadStore, extra: Partial<EngineDeps> = {}) {
  return new DownloadEngine({
    client: server.client,
    session: { userId: 'u1', token: 'TOKEN' },
    deviceId: 'dev',
    store,
    fetchFn: server.fetchFn as unknown as typeof fetch,
    isOnline: () => true,
    sleep: async () => undefined,
    ...extra,
  });
}

const settled = (engine: DownloadEngine, id: string, state: string) => vi.waitFor(() => expect(engine.get(id)?.state).toBe(state));

describe('DownloadEngine', () => {
  it('downloads an item to the end and saves everything under its prefix', async () => {
    const { data, store } = memoryStore();
    const server = fakeServer(4);
    const engine = makeEngine(server, store);
    await engine.start();
    await engine.enqueue([movie], 'medium');
    await settled(engine, 'm1', 'done');

    const e = engine.get('m1');
    expect([e?.segmentsDone, e?.segmentsTotal, e?.bytes, e?.error]).toEqual([4, 4, 400, '']);
    for (let i = 0; i < 4; i++) expect(data.has(segmentKey('m1', i))).toBe(true);
    const playlist = String(data.get(playlistKey('m1'))?.body);
    expect(playlist).toContain('#EXT-X-ENDLIST');
    expect(playlist).toContain('seg-3');
    expect(data.has(itemJsonKey('m1'))).toBe(true);
    expect(data.has('./downloads/m1/subs-2.vtt')).toBe(true); // the text track
    expect(data.has('./downloads/m1/subs-3.vtt')).toBe(false); // the image track is not saved
    expect(data.has('./downloads/m1/segments.json')).toBe(true);
    expect(data.has(planKey('m1'))).toBe(false);
    const meta = JSON.parse(String(data.get(metaKey('m1'))?.body)) as DownloadMeta;
    expect(meta.entry.state).toBe('done');
    expect(meta.subtitles.map((s) => s.index)).toEqual([2]);
    expect(parseIndex(String(data.get(INDEX_KEY)?.body))[0].state).toBe('done');
    expect(server.client.stopTranscode).toHaveBeenCalledWith('dev', 'p1');
    engine.stop();
  });

  it('asks for a forced transcode without burned-in subtitles and never saves the token', async () => {
    const { data, store } = memoryStore();
    const server = fakeServer(2);
    const engine = makeEngine(server, store);
    await engine.start();
    await engine.enqueue([movie], 'small');
    await settled(engine, 'm1', 'done');
    const call = server.client.playbackInfo.mock.calls[0] as unknown as [string, string, { MaxStreamingBitrate: number }, Record<string, unknown>];
    expect(call[2].MaxStreamingBitrate).toBe(1_200_000);
    expect(call[3]).toMatchObject({ directPlay: false, directStream: false, subtitleStreamIndex: -1 });
    expect(server.calls.some((u) => u.includes('master.m3u8') && u.includes('MaxHeight=480') && u.includes('AllowVideoStreamCopy=false'))).toBe(true);
    for (const [key, value] of data) if (key.endsWith('.json')) expect(String(value.body)).not.toContain('TOKEN');
    engine.stop();
  });

  it('keeps the queue in order and runs one item at a time', async () => {
    const { store } = memoryStore();
    const server = fakeServer(2);
    const engine = makeEngine(server, store);
    await engine.start();
    await engine.enqueue([movie, { ...movie, Id: 'm2' }], 'medium');
    await settled(engine, 'm2', 'done');
    expect(engine.get('m1')?.state).toBe('done');
    const order = server.client.playbackInfo.mock.calls.map((c) => (c as unknown as [string, string])[1]);
    expect(order).toEqual(['m1', 'm2']);
    engine.stop();
  });

  it('continues a saved download at the same segment when a fresh playlist has the same count', async () => {
    const { data, store } = memoryStore();
    const entry = { ...entryFromItem(movie, 'medium', 'd'), state: 'downloading' as const, segmentsDone: 2, segmentsTotal: 4, bytes: 200 };
    const plan: DownloadPlan = { initUri: null, segments: [0, 1, 2, 3].map((i) => ({ duration: 6, uri: `http://pc:8096/old/${i}.ts` })) };
    const meta: DownloadMeta = { entry, audioStreamIndex: 1, mediaSourceId: 'src1', playSessionId: 'old', subtitles: [] };
    await store.put(INDEX_KEY, serializeIndex([entry]), 'application/json');
    await store.put(planKey('m1'), JSON.stringify(plan), 'application/json');
    await store.put(metaKey('m1'), JSON.stringify(meta), 'application/json');
    await store.put(segmentKey('m1', 0), new ArrayBuffer(100), 'x');
    await store.put(segmentKey('m1', 1), new ArrayBuffer(100), 'x');

    const server = fakeServer(4, { fail: (url) => (url.includes('/old/') ? 404 : null) });
    const engine = makeEngine(server, store);
    await engine.start();
    await settled(engine, 'm1', 'done');
    expect(server.calls.filter((u) => u.includes('/old/')).length).toBe(1); // the saved link failed once
    expect(server.calls.filter((u) => u.includes('hls1/main/0.ts')).length).toBe(0); // 0 and 1 were not downloaded again
    expect(server.calls.filter((u) => u.includes('hls1/main/2.ts')).length).toBe(1);
    expect(engine.get('m1')?.bytes).toBe(400);
    expect(data.has(segmentKey('m1', 3))).toBe(true);
    engine.stop();
  });

  it('starts that item over when the fresh playlist has a different segment count', async () => {
    const { data, store } = memoryStore();
    const entry = { ...entryFromItem(movie, 'medium', 'd'), state: 'downloading' as const, segmentsDone: 2, segmentsTotal: 4, bytes: 200 };
    const plan: DownloadPlan = { initUri: null, segments: [0, 1, 2, 3].map((i) => ({ duration: 6, uri: `http://pc:8096/old/${i}.ts` })) };
    const meta: DownloadMeta = { entry, audioStreamIndex: 1, mediaSourceId: 'src1', playSessionId: 'old', subtitles: [] };
    await store.put(INDEX_KEY, serializeIndex([entry]), 'application/json');
    await store.put(planKey('m1'), JSON.stringify(plan), 'application/json');
    await store.put(metaKey('m1'), JSON.stringify(meta), 'application/json');
    await store.put(segmentKey('m1', 0), new ArrayBuffer(100), 'stale');
    await store.put(segmentKey('m1', 1), new ArrayBuffer(100), 'stale');

    const server = fakeServer(5, { fail: (url) => (url.includes('/old/') ? 404 : null) });
    const engine = makeEngine(server, store);
    await engine.start();
    await settled(engine, 'm1', 'done');
    expect(engine.get('m1')?.segmentsTotal).toBe(5);
    expect(server.calls.filter((u) => u.includes('hls1/main/0.ts')).length).toBe(1); // from the start again
    expect(data.get(segmentKey('m1', 0))?.type).toBe('application/octet-stream'); // replaced, not the stale one
    expect(engine.get('m1')?.bytes).toBe(500);
    engine.stop();
  });

  it('marks a download failed after the retries, keeps its data and continues on Retry', async () => {
    const { data, store } = memoryStore();
    let broken = true;
    const server = fakeServer(4, { fail: (url) => (broken && url.includes('hls1/main/2.ts') ? 503 : null) });
    const engine = makeEngine(server, store);
    await engine.start();
    await engine.enqueue([movie], 'medium');
    await settled(engine, 'm1', 'failed');
    expect(engine.get('m1')?.error).toContain('error 503');
    expect(engine.get('m1')?.segmentsDone).toBe(2);
    expect(data.has(segmentKey('m1', 1))).toBe(true);
    expect(server.calls.filter((u) => u.includes('hls1/main/2.ts')).length).toBe(4); // 1 try + 3 retries

    broken = false;
    engine.retry('m1');
    await settled(engine, 'm1', 'done');
    expect(server.calls.filter((u) => u.includes('hls1/main/0.ts')).length).toBe(1);
    expect(engine.get('m1')?.segmentsDone).toBe(4);
    engine.stop();
  });

  it('waits while offline and goes on when the connection is back', async () => {
    const { store } = memoryStore();
    const server = fakeServer(2);
    let online = false;
    const engine = makeEngine(server, store, { isOnline: () => online });
    await engine.start();
    await engine.enqueue([movie], 'medium');
    expect(engine.get('m1')?.state).toBe('queued');
    expect(server.client.playbackInfo).not.toHaveBeenCalled();
    online = true;
    engine.resume('m1'); // any kick runs the queue
    await settled(engine, 'm1', 'done');
    engine.stop();
  });

  it('removes everything of an item and its entry', async () => {
    const { data, store } = memoryStore();
    const server = fakeServer(3);
    const engine = makeEngine(server, store);
    await engine.start();
    await engine.enqueue([movie], 'medium');
    await settled(engine, 'm1', 'done');
    await engine.remove('m1');
    expect(engine.get('m1')).toBeUndefined();
    expect(Array.from(data.keys()).filter((k) => k.startsWith('./downloads/m1/'))).toEqual([]);
    expect(parseIndex(String(data.get(INDEX_KEY)?.body))).toEqual([]);
    expect(data.has(initKey('m1'))).toBe(false);
    engine.stop();
  });

  it('puts an interrupted download back in the queue on start', async () => {
    const { store } = memoryStore();
    const entry = { ...entryFromItem(movie, 'medium', 'd'), state: 'paused' as const };
    await store.put(INDEX_KEY, serializeIndex([entry, { ...entry, id: 'm2', state: 'downloading' }]), 'application/json');
    const server = fakeServer(1);
    const engine = makeEngine(server, store, { isOnline: () => false });
    await engine.start();
    expect(engine.getSnapshot().map((e) => `${e.id}:${e.state}`)).toEqual(['m1:paused', 'm2:queued']);
    engine.stop();
  });
});
