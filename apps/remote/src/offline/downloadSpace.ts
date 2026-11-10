import { formatBytes } from './downloadQuality';

/** "3 downloads · 1.2 GB" for the top of the Downloads screen. */
export function downloadsLine(count: number, bytes: number): string {
  if (count <= 0) return 'No downloads yet';
  return `${count} ${count === 1 ? 'download' : 'downloads'} · ${formatBytes(bytes)}`;
}

/** "41 GB free on this phone", or an empty string when the browser gives no numbers. */
export function freeLine(usage: number | null | undefined, quota: number | null | undefined): string {
  if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) return '';
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return '';
  return `${formatBytes(Math.max(0, quota - usage))} free on this phone`;
}
