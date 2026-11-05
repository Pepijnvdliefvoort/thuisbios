import { artFor } from './art';
import type { BaseItem } from './types';

/** Most slides the desktop spotlight cycles through. */
export const SPOTLIGHT_MAX = 5;

/**
 * Picks the spotlight slides: items with a backdrop, alternating movies and shows (newest first within each),
 * at most `max`.
 */
export function spotlightItems(movies: BaseItem[], shows: BaseItem[], max: number = SPOTLIGHT_MAX): BaseItem[] {
  const withArt = (list: BaseItem[]) => list.filter((item) => artFor(item, 'backdrop'));
  const a = withArt(movies);
  const b = withArt(shows);
  const out: BaseItem[] = [];
  for (let i = 0; out.length < max && (i < a.length || i < b.length); i++) {
    if (i < a.length && out.length < max) out.push(a[i]);
    if (i < b.length && out.length < max) out.push(b[i]);
  }
  return out;
}
