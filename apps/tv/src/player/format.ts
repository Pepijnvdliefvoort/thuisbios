/** m:ss or h:mm:ss. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => (n < 10 ? '0' + n : '' + n);
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** Time left as "-1:23:45". */
export function formatRemaining(position: number, duration: number): string {
  return '-' + formatTime(Math.max(0, duration - position));
}

/** Signed seek total for the bubble: "-30" (with a real minus sign) or "+20". */
export function formatSeekTotal(total: number): string {
  return (total < 0 ? '−' : '+') + Math.abs(total);
}
