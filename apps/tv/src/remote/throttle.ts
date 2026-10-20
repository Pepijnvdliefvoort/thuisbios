/**
 * Runs `fn` at most once per `ms`. The first call goes out at once; calls inside the window collapse
 * into one trailing call, so the final state of a burst is always reported.
 */
export function createThrottle(fn: () => void, ms: number): { call(): void; cancel(): void } {
  let last = -Infinity;
  let timer = 0;
  const run = () => {
    timer = 0;
    last = Date.now();
    fn();
  };
  return {
    call() {
      if (timer) return;
      const wait = last + ms - Date.now();
      if (wait <= 0) run();
      else timer = window.setTimeout(run, wait);
    },
    cancel() {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    },
  };
}
