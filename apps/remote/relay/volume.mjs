/** Press-by-press volume for TVs whose level cannot be read or set (the TV sends sound to a soundbar). */

export const PRESS_DELAY_MS = 120;
export const MAX_PRESSES = 50;
export const DEFAULT_LEVEL = 20;

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps a remembered estimate of the level and walks it to a target with volume key presses.
 * A newer target retargets a running burst instead of queueing behind it.
 * @param {object} options
 * @param {(key: 'KEY_VOLUP' | 'KEY_VOLDOWN') => Promise<void>} options.press
 * @param {number} [options.delayMs]
 * @param {number} [options.maxPresses] per setTarget call
 * @param {number} [options.initial]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
export function createVolumeBurst({ press, delayMs = PRESS_DELAY_MS, maxPresses = MAX_PRESSES, initial = DEFAULT_LEVEL, sleep = wait }) {
  let estimate = initial;
  let target = initial;
  let budget = 0;
  let running = false;
  /** @type {{ resolve(level: number): void, reject(e: unknown): void } | null} */
  let waiter = null;

  async function run() {
    running = true;
    try {
      while (estimate !== target && budget > 0) {
        const up = target > estimate;
        await press(up ? 'KEY_VOLUP' : 'KEY_VOLDOWN');
        estimate += up ? 1 : -1;
        budget -= 1;
        if (estimate !== target && budget > 0) await sleep(delayMs);
      }
      const w = waiter;
      waiter = null;
      w?.resolve(estimate);
    } catch (e) {
      const w = waiter;
      waiter = null;
      w?.reject(e);
    } finally {
      running = false;
    }
  }

  return {
    get level() {
      return estimate;
    },
    /** Remember a level learned another way (e.g. a real reading). Ignored during a burst. */
    remember(/** @type {number} */ level) {
      if (!running) {
        estimate = level;
        target = level;
      }
    },
    /**
     * Moves toward `level` (integer 0-100). Resolves with the estimate when this call's burst ends;
     * a call that is overtaken by a newer one resolves at once with the estimate at that moment.
     * @param {number} level
     * @returns {Promise<number>}
     */
    setTarget(level) {
      target = level;
      budget = maxPresses;
      waiter?.resolve(estimate);
      const result = new Promise((resolve, reject) => {
        waiter = { resolve, reject };
      });
      if (!running) void run();
      return result;
    },
  };
}
