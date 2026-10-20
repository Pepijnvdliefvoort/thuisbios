import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVolumeBurst } from './volume.mjs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(extra = {}) {
  const keys: string[] = [];
  const press = vi.fn(async (key: string) => {
    keys.push(key);
  });
  const burst = createVolumeBurst({ press: press as never, ...extra });
  return { burst, keys, press };
}

describe('volume burst', () => {
  it('starts at 20 and walks up with 120 ms between presses', async () => {
    const { burst, keys } = make();
    expect(burst.level).toBe(20);
    let done = false;
    void burst.setTarget(23).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(keys).toEqual(['KEY_VOLUP']);
    await vi.advanceTimersByTimeAsync(119);
    expect(keys).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(keys).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(120);
    expect(done).toBe(true);
    expect(keys).toEqual(['KEY_VOLUP', 'KEY_VOLUP', 'KEY_VOLUP']);
    expect(burst.level).toBe(23);
  });

  it('walks down and does nothing at the target', async () => {
    const { burst, keys } = make({ initial: 5 });
    const p = burst.setTarget(3);
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toBe(3);
    expect(keys).toEqual(['KEY_VOLDOWN', 'KEY_VOLDOWN']);
    expect(await burst.setTarget(3)).toBe(3);
    expect(keys).toHaveLength(2);
  });

  it('retargets a running burst; the older call resolves at once', async () => {
    const { burst, keys } = make({ initial: 10 });
    const first = burst.setTarget(20);
    await vi.advanceTimersByTimeAsync(250); // 3 presses: 13
    const firstResult = vi.fn();
    void first.then(firstResult);
    const second = burst.setTarget(11);
    await vi.advanceTimersByTimeAsync(0);
    expect(firstResult).toHaveBeenCalledWith(13);
    await vi.advanceTimersByTimeAsync(500);
    expect(await second).toBe(11);
    expect(keys.slice(0, 3)).toEqual(['KEY_VOLUP', 'KEY_VOLUP', 'KEY_VOLUP']);
    expect(keys.slice(3)).toEqual(['KEY_VOLDOWN', 'KEY_VOLDOWN']);
  });

  it('caps one request at 50 presses', async () => {
    const { burst, keys } = make({ initial: 0 });
    const p = burst.setTarget(100);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe(50);
    expect(keys).toHaveLength(50);
    expect(burst.level).toBe(50);
  });

  it('rejects when a press fails and stays usable', async () => {
    const press = vi.fn().mockRejectedValueOnce(new Error('tv off')).mockResolvedValue(undefined);
    const burst = createVolumeBurst({ press, initial: 10 });
    const failed = burst.setTarget(12);
    await expect(failed).rejects.toThrow('tv off');
    expect(burst.level).toBe(10);
    const ok = burst.setTarget(11);
    await vi.advanceTimersByTimeAsync(10);
    expect(await ok).toBe(11);
  });

  it('remember() sets the estimate when idle', () => {
    const { burst } = make();
    burst.remember(42);
    expect(burst.level).toBe(42);
  });
});
