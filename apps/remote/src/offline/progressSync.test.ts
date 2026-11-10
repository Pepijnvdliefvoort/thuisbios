import { describe, expect, it, vi } from 'vitest';
import { createProgressSync } from './progressSync';
import type { PendingProgress } from './progressQueue';

function setup(over: { online?: boolean; markPlayed?: (u: string, i: string) => Promise<void>; saveProgress?: (u: string, i: string, t: number) => Promise<void> } = {}) {
  let queue: PendingProgress[] = [];
  const state = { online: over.online !== false };
  const markPlayed = vi.fn(over.markPlayed || (async () => undefined));
  const saveProgress = vi.fn(over.saveProgress || (async () => undefined));
  const sync = createProgressSync({
    client: { markPlayed, saveProgress },
    userId: 'u',
    load: () => queue,
    save: (q) => {
      queue = q;
    },
    isOnline: () => state.online,
  });
  return { sync, state, markPlayed, saveProgress, queue: () => queue, set: (q: PendingProgress[]) => (queue = q) };
}

describe('progress sync', () => {
  it('queues the latest position per item and sends it once online', async () => {
    const t = setup({ online: false });
    t.sync.enqueue({ itemId: 'a', positionTicks: 100, played: false, at: 1 });
    t.sync.enqueue({ itemId: 'a', positionTicks: 300, played: false, at: 3 });
    t.sync.enqueue({ itemId: 'b', positionTicks: 0, played: true, at: 2 });
    await t.sync.flush();
    expect(t.saveProgress).not.toHaveBeenCalled();
    expect(t.queue()).toHaveLength(2);
    t.state.online = true;
    await t.sync.flush();
    expect(t.saveProgress).toHaveBeenCalledTimes(1);
    expect(t.saveProgress).toHaveBeenCalledWith('u', 'a', 300);
    expect(t.markPlayed).toHaveBeenCalledWith('u', 'b');
    expect(t.queue()).toEqual([]);
  });
  it('keeps entries when the network fails and stops there', async () => {
    const t = setup({ saveProgress: async () => Promise.reject(new TypeError('Failed to fetch')) });
    t.sync.enqueue({ itemId: 'a', positionTicks: 100, played: false, at: 1 });
    t.sync.enqueue({ itemId: 'b', positionTicks: 100, played: false, at: 2 });
    await t.sync.flush();
    expect(t.saveProgress).toHaveBeenCalledTimes(1);
    expect(t.queue()).toHaveLength(2);
  });
  it('drops an entry the server will never accept, and goes on', async () => {
    const t = setup({ saveProgress: async (_u, i) => (i === 'a' ? Promise.reject(Object.assign(new Error('gone'), { status: 404 })) : undefined) });
    t.sync.enqueue({ itemId: 'a', positionTicks: 100, played: false, at: 1 });
    t.sync.enqueue({ itemId: 'b', positionTicks: 100, played: false, at: 2 });
    await t.sync.flush();
    expect(t.queue()).toEqual([]);
  });
  it('keeps entries on a server error and on sign-out', async () => {
    const t = setup({ markPlayed: async () => Promise.reject(Object.assign(new Error('x'), { status: 401 })) });
    t.sync.enqueue({ itemId: 'a', positionTicks: 0, played: true, at: 1 });
    await t.sync.flush();
    expect(t.queue()).toHaveLength(1);
  });
  it('does not drop a newer position added while sending', async () => {
    let t!: ReturnType<typeof setup>;
    t = setup({
      saveProgress: async () => {
        t.sync.enqueue({ itemId: 'a', positionTicks: 900, played: false, at: 9 });
      },
    });
    t.sync.enqueue({ itemId: 'a', positionTicks: 100, played: false, at: 1 });
    await t.sync.flush();
    expect(t.saveProgress).toHaveBeenCalledTimes(2);
    expect(t.saveProgress).toHaveBeenLastCalledWith('u', 'a', 900);
    expect(t.queue()).toEqual([]);
  });
  it('only sends entries of its own user', async () => {
    const t = setup();
    t.set([{ userId: 'other', itemId: 'x', positionTicks: 5, played: false, at: 1 }]);
    await t.sync.flush();
    expect(t.saveProgress).not.toHaveBeenCalled();
    expect(t.queue()).toHaveLength(1);
  });
});
