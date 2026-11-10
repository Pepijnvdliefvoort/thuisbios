import { describe, expect, it } from 'vitest';
import { entryFromItem, type DownloadEntry, type DownloadState } from './downloadIndex';
import * as q from './downloadQueue';

const make = (id: string, state: DownloadState = 'queued'): DownloadEntry => ({ ...entryFromItem({ Id: id, Name: id, Type: 'Movie' }, 'medium', 'd'), state });
const states = (list: DownloadEntry[]) => list.map((e) => `${e.id}:${e.state}`);

describe('queue', () => {
  it('adds new entries at the end and ignores duplicates', () => {
    const list = q.enqueue(q.enqueue([], make('a')), make('b'));
    expect(states(list)).toEqual(['a:queued', 'b:queued']);
    expect(q.enqueue(list, make('a', 'done'))).toBe(list);
  });

  it('runs first-in first-out', () => {
    const list = [make('a', 'done'), make('b'), make('c')];
    expect(q.nextToRun(list)?.id).toBe('b');
    expect(q.nextToRun(q.start(list, 'b'))?.id).toBe('b');
    expect(q.nextToRun(q.pause(list, 'b'))?.id).toBe('c');
    expect(q.nextToRun([make('a', 'done'), make('b', 'paused'), make('c', 'failed')])).toBeNull();
  });

  it('start marks downloading and clears an old note', () => {
    const list = q.patchEntry([make('a')], 'a', { error: 'Waiting for a connection.' });
    const [e] = q.start(list, 'a');
    expect([e.state, e.error]).toEqual(['downloading', '']);
  });

  it('pause and resume only apply from the right states', () => {
    expect(states(q.pause([make('a', 'downloading')], 'a'))).toEqual(['a:paused']);
    expect(states(q.pause([make('a', 'done')], 'a'))).toEqual(['a:done']);
    expect(states(q.pause([make('a', 'failed')], 'a'))).toEqual(['a:failed']);
    expect(states(q.resume([make('a', 'paused')], 'a'))).toEqual(['a:queued']);
    expect(states(q.resume([make('a', 'downloading')], 'a'))).toEqual(['a:downloading']);
  });

  it('a resumed item keeps its place in the queue', () => {
    const list = q.resume([make('a', 'paused'), make('b')], 'a');
    expect(q.nextToRun(list)?.id).toBe('a');
  });

  it('fail keeps the progress and retry continues from it', () => {
    let list = [q.progress([make('a', 'downloading')], 'a', 40, 100, 5000)[0]];
    list = q.fail(list, 'a', 'The connection dropped.');
    expect([list[0].state, list[0].error, list[0].segmentsDone]).toEqual(['failed', 'The connection dropped.', 40]);
    list = q.retry(list, 'a');
    expect([list[0].state, list[0].error, list[0].segmentsDone, list[0].bytes]).toEqual(['queued', '', 40, 5000]);
  });

  it('requeue puts a running item back with a note', () => {
    const [e] = q.requeue([make('a', 'downloading')], 'a', 'Waiting for a connection.');
    expect([e.state, e.error]).toEqual(['queued', 'Waiting for a connection.']);
  });

  it('complete marks done with all segments and the byte count', () => {
    const list = q.progress([make('a', 'downloading')], 'a', 99, 100, 10);
    const [e] = q.complete(list, 'a', 12345);
    expect([e.state, e.segmentsDone, e.segmentsTotal, e.bytes, e.error]).toEqual(['done', 100, 100, 12345, '']);
  });

  it('removes an entry', () => {
    expect(states(q.remove([make('a'), make('b')], 'a'))).toEqual(['b:queued']);
  });

  it('after a start, interrupted downloads go back in the queue', () => {
    const list = [make('a', 'downloading'), make('b', 'paused'), make('c', 'done')];
    expect(states(q.recoverAfterStart(list))).toEqual(['a:queued', 'b:paused', 'c:done']);
    const same = [make('a', 'done')];
    expect(q.recoverAfterStart(same)).toBe(same);
  });

  it('leaves the list alone for an unknown id', () => {
    const list = [make('a')];
    expect(q.pause(list, 'zzz')).toBe(list);
    expect(q.patchEntry(list, 'zzz', { name: 'x' })).toBe(list);
  });
});
