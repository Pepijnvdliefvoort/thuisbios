import type { BaseItem, Person } from './types';

/** Most actors shown in the cast row (Jellyfin lists them in billing order, so the cut drops the tail). */
export const MAX_CAST = 20;

const ACTOR_TYPES = ['Actor', 'GuestStar'];

/** The actors of an item in Jellyfin's order, without repeats and capped at `max`. */
export function castOf(item: Pick<BaseItem, 'People'>, max: number = MAX_CAST): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of item.People || []) {
    if (!p.Id || !p.Name || !p.Type || ACTOR_TYPES.indexOf(p.Type) < 0 || seen.has(p.Id)) continue;
    seen.add(p.Id);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** A crew line such as "Director" with its people (Jellyfin's order, without repeats). */
export interface CrewGroup {
  label: string;
  people: Person[];
}

/** The directors and writers of an item, as ready labelled groups (a group without people is left out). */
export function crewOf(item: Pick<BaseItem, 'People'>): CrewGroup[] {
  const pick = (type: string): Person[] => {
    const seen = new Set<string>();
    return (item.People || []).filter((p) => {
      if (!p.Id || !p.Name || p.Type !== type || seen.has(p.Id)) return false;
      seen.add(p.Id);
      return true;
    });
  };
  const directors = pick('Director');
  const writers = pick('Writer');
  const groups: CrewGroup[] = [];
  if (directors.length > 0) groups.push({ label: directors.length > 1 ? 'Directors' : 'Director', people: directors });
  if (writers.length > 0) groups.push({ label: writers.length > 1 ? 'Writers' : 'Writer', people: writers });
  return groups;
}

/** Whether there is anything to show in the Cast & crew section. */
export const hasPeople = (item: Pick<BaseItem, 'People'>): boolean => castOf(item, 1).length > 0 || crewOf(item).length > 0;

/** Up to two initials of a name, for the photo placeholder ("Ada Lovelace" gives "AL"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] || '';
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
  return (first + last).toUpperCase();
}

/** Photo URL of a person at exactly width x height, or '' when Jellyfin has no photo for them. */
export function personImageUrl(serverUrl: string, person: Pick<Person, 'Id' | 'PrimaryImageTag'>, width: number, height: number): string {
  if (!person.PrimaryImageTag) return '';
  return `${serverUrl}/Items/${encodeURIComponent(person.Id)}/Images/Primary?fillWidth=${width}&fillHeight=${height}&quality=80&tag=${encodeURIComponent(person.PrimaryImageTag)}`;
}

/** The same for a full person item (its photo tag sits in ImageTags). */
export function personItemImageUrl(serverUrl: string, item: Pick<BaseItem, 'Id' | 'ImageTags'>, width: number, height: number): string {
  return personImageUrl(serverUrl, { Id: item.Id, PrimaryImageTag: item.ImageTags && item.ImageTags.Primary }, width, height);
}

/** A birth date such as "12 Mar 1975" from Jellyfin's ISO date, or '' when missing or invalid. */
export function formatBirthDate(iso: string | undefined, locale?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // Jellyfin stores dates at midnight UTC; read them in UTC so a negative offset does not show the day before.
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
