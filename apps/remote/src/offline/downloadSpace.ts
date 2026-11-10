import { formatBytes } from './downloadQuality';

/** "Using 3.2 GB · 41 GB free on this phone", or a plain fallback when the browser gives no numbers. */
export function spaceLine(usage: number | null | undefined, quota: number | null | undefined): string {
  if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) return "This phone doesn't say how much space is used.";
  const used = `Using ${formatBytes(usage)}`;
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return used;
  return `${used} · ${formatBytes(Math.max(0, quota - usage))} free on this phone`;
}
