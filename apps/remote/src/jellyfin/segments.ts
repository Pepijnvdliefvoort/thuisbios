/** Jellyfin media segments (10.10+), filled by plugins such as Intro Skipper. */
export type SegmentType = 'Unknown' | 'Commercial' | 'Preview' | 'Recap' | 'Outro' | 'Intro';

export interface MediaSegment {
  type: SegmentType;
  /** 100 ns units, like every Jellyfin position. */
  startTicks: number;
  endTicks: number;
}

const TICKS_PER_SECOND = 10000000;
const TYPES: SegmentType[] = ['Unknown', 'Commercial', 'Preview', 'Recap', 'Outro', 'Intro'];
/** Shorter segments are noise, not an intro worth a button. */
const MIN_INTRO_SECONDS = 2;
/** The button hides this long before the intro ends, so it never lingers into the episode. */
const HIDE_BEFORE_END_SECONDS = 1;

/** Reads the `/MediaSegments/{id}` response; anything malformed is dropped, never thrown. */
export function parseSegments(raw: unknown): MediaSegment[] {
  const items = raw && typeof raw === 'object' ? (raw as { Items?: unknown }).Items : undefined;
  if (!Array.isArray(items)) return [];
  const out: MediaSegment[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { Type?: unknown; StartTicks?: unknown; EndTicks?: unknown };
    const type = TYPES.indexOf(e.Type as SegmentType) >= 0 ? (e.Type as SegmentType) : null;
    const start = e.StartTicks;
    const end = e.EndTicks;
    if (!type || typeof start !== 'number' || typeof end !== 'number') continue;
    if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) continue;
    out.push({ type, startTicks: start, endTicks: end });
  }
  return out;
}

/** The intro the position (seconds) is inside, or null. */
export function activeIntro(segments: MediaSegment[], seconds: number): MediaSegment | null {
  if (!isFinite(seconds)) return null;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.type !== 'Intro') continue;
    const start = s.startTicks / TICKS_PER_SECOND;
    const end = s.endTicks / TICKS_PER_SECOND;
    if (end - start < MIN_INTRO_SECONDS) continue;
    if (seconds >= start && seconds < end - HIDE_BEFORE_END_SECONDS) return s;
  }
  return null;
}
