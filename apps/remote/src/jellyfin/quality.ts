import type { MediaSource, MediaStream } from './types';

/** "auto" follows the measured connection; a number is a fixed level, named by its height in pixels. */
export type QualityId = 'auto' | number;

export interface QualityLevel {
  /** Picture height this level stands for, which is also its id. */
  height: number;
  /** Width of the matching 16:9 picture, used to recognise wide films (1920x800 is still 1080p). */
  width: number;
  label: string;
  /** Video bitrate cap in bit/s. */
  bitrate: number;
}

/**
 * Highest first. The bitrates are what h264 needs for a clean picture at that size with some headroom
 * (the server picks the exact encode, this is only the ceiling): 4K ~40, 1440p ~20, 1080p ~10, 720p ~4,
 * 480p ~2 and 360p ~1 Mbit/s.
 */
export const LEVELS: QualityLevel[] = [
  { height: 2160, width: 3840, label: '4K', bitrate: 40_000_000 },
  { height: 1440, width: 2560, label: '1440p', bitrate: 20_000_000 },
  { height: 1080, width: 1920, label: '1080p', bitrate: 10_000_000 },
  { height: 720, width: 1280, label: '720p', bitrate: 4_000_000 },
  { height: 480, width: 854, label: '480p', bitrate: 2_000_000 },
  { height: 360, width: 640, label: '360p', bitrate: 1_000_000 },
];

/** Bitrate cap for the source's own resolution: high enough that nothing gets converted just for its bitrate. */
export const ORIGINAL_BITRATE = 100_000_000;

/** A picture a few percent short of a level (cropped black bars, 3832x2076) still counts as that level. */
const SLACK = 0.95;

/** The level a picture size belongs to: the highest one it (nearly) reaches by height or by width. Null when unknown. */
export function levelFor(height?: number, width?: number): QualityLevel | null {
  if (!height && !width) return null;
  for (const l of LEVELS) {
    if ((height && height >= l.height * SLACK) || (width && width >= l.width * SLACK)) return l;
  }
  return LEVELS[LEVELS.length - 1];
}

/** The video stream of a source (carries Height and Width). */
function videoStream(source: MediaSource): MediaStream | undefined {
  return (source.MediaStreams ?? []).filter((s) => s.Type === 'Video')[0];
}

/** The level of the source's own picture, null when the server did not report a size. */
export function sourceLevel(source: MediaSource): QualityLevel | null {
  const v = videoStream(source);
  return v ? levelFor(v.Height, v.Width) : null;
}

/** The resolution of a source as a label for display ("4K", "1080p"), null when unknown. */
export function sourceResolutionLabel(source: MediaSource): string | null {
  const l = sourceLevel(source);
  return l ? l.label : null;
}

export interface QualityOption {
  id: QualityId;
  /** Plain resolution wording. Auto carries what is playing when known: "Auto (720p)". */
  label: string;
}

/**
 * The choices for a source: Auto first, then the levels from the source's own resolution downwards (a 720p film
 * is never offered 1080p). `autoNote` is the resolution that is playing now, shown next to Auto. A source of
 * unknown size gets Auto only, so the menu stays away.
 */
export function qualityOptions(source: MediaSource, autoNote?: string | null): QualityOption[] {
  const top = sourceLevel(source);
  const auto: QualityOption = { id: 'auto', label: autoNote ? `Auto (${autoNote})` : 'Auto' };
  if (!top) return [auto];
  return [
    auto,
    ...LEVELS.filter((l) => l.height <= top.height).map((l) => ({
      id: l.height,
      label: l.height === top.height ? `${l.label} (original)` : l.label,
    })),
  ];
}

export interface QualityRequest {
  /** Bitrate cap to put in the device profile (bit/s). */
  bitrate: number;
  /** Picture size cap for the server to scale down to; absent for the original. */
  maxHeight?: number;
  maxWidth?: number;
  /** The source's own resolution: direct play stays possible. */
  original: boolean;
}

/**
 * What to ask Jellyfin for a fixed level. A level at or above the source's own resolution is the original: only
 * the bitrate cap is raised, so direct play stays possible. `sourceHeight` is the height of the source's level
 * (`sourceLevel(source).height`); null while the source is not known, then the level is applied as a plain cap.
 */
export function requestFor(id: number, sourceHeight: number | null): QualityRequest | null {
  const level = LEVELS.filter((l) => l.height === id)[0];
  if (!level) return null;
  if (sourceHeight !== null && level.height >= sourceHeight) return { bitrate: ORIGINAL_BITRATE, original: true };
  return { bitrate: level.bitrate, maxHeight: level.height, maxWidth: level.width, original: false };
}

/**
 * The resolution that is actually playing, for the Auto label: the source's own for direct play or direct stream,
 * the MaxHeight/MaxWidth of the transcoding URL for a transcode. Null when the URL says nothing about size.
 */
export function playingResolution(source: MediaSource, method: string, url: string): string | null {
  if (method !== 'Transcode') return sourceResolutionLabel(source);
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  const num = (...keys: string[]) => {
    for (const k of keys) {
      for (const [name, value] of params) if (name.toLowerCase() === k.toLowerCase() && parseInt(value, 10) > 0) return parseInt(value, 10);
    }
    return undefined;
  };
  const capped = levelFor(num('maxHeight', 'height'), num('maxWidth', 'width'));
  const own = sourceLevel(source);
  if (!capped) return null;
  // A cap above the source's own size does not enlarge the picture.
  return own && own.height < capped.height ? own.label : capped.label;
}
