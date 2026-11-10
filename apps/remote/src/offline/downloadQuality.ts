/** The three download qualities and the size estimate shown before downloading. */

export type DownloadQuality = 'high' | 'medium' | 'small';

export interface QualityPreset {
  id: DownloadQuality;
  label: string;
  /** Short name of the picture size. */
  resolution: string;
  maxWidth: number;
  maxHeight: number;
  /** Cap for video and audio together, in bit/s (what the profile asks the server for). */
  bitrate: number;
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'high', label: 'High', resolution: '1080p', maxWidth: 1920, maxHeight: 1080, bitrate: 5_000_000 },
  { id: 'medium', label: 'Medium', resolution: '720p', maxWidth: 1280, maxHeight: 720, bitrate: 2_500_000 },
  { id: 'small', label: 'Small', resolution: '480p', maxWidth: 854, maxHeight: 480, bitrate: 1_200_000 },
];

export const DEFAULT_QUALITY: DownloadQuality = 'medium';

export function presetFor(id: string): QualityPreset {
  return QUALITY_PRESETS.find((p) => p.id === id) || (QUALITY_PRESETS.find((p) => p.id === DEFAULT_QUALITY) as QualityPreset);
}

export const isQuality = (value: unknown): value is DownloadQuality => QUALITY_PRESETS.some((p) => p.id === value);

const TICKS_PER_SECOND = 10_000_000;

/**
 * Estimated download size in bytes: runtime times the bitrate cap. The server often stays below the cap (dark or
 * simple pictures), so this is an upper estimate. Zero when the runtime is unknown.
 */
export function estimateBytes(runTimeTicks: number | undefined, quality: DownloadQuality): number {
  if (!runTimeTicks || runTimeTicks <= 0) return 0;
  return Math.round((runTimeTicks / TICKS_PER_SECOND) * (presetFor(quality).bitrate / 8));
}

/** "1.4 GB", "820 MB", "12 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** "About 1.4 GB", or "Size unknown" when the runtime is not known. */
export function estimateLabel(bytes: number): string {
  return bytes > 0 ? `About ${formatBytes(bytes)}` : 'Size unknown';
}
