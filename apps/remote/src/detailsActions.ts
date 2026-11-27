/** The actions of the phone details page that can sit in the quick-action row. */
export type QuickActionId = 'list' | 'trailer' | 'download' | 'watched' | 'together';

/** Ids that own a sheet of their own (trailer player, download sheets), so they must stay in the row. */
const PINNED: readonly QuickActionId[] = ['trailer', 'download'];

/**
 * Splits the applicable actions (in display order) into the row and the "More" sheet: the first `max` go in the row,
 * the rest overflow. `trailer` and `download` never overflow, because their components render their own sheets; the
 * order list, trailer, download, watched, together guarantees that for the default `max` of 3 (they are the first
 * three possible ids, so their index is always below 3), and a pinned id past the limit still stays in the row.
 */
export function splitQuickActions(ids: QuickActionId[], max = 3): { row: QuickActionId[]; more: QuickActionId[] } {
  const row: QuickActionId[] = [];
  const more: QuickActionId[] = [];
  ids.forEach((id, i) => {
    if (i < max || PINNED.includes(id)) row.push(id);
    else more.push(id);
  });
  return { row, more };
}
