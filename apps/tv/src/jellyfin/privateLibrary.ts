/**
 * The private library: its name, trimmed, lowercased and without accents, is `prive` or `private`.
 * The same rule as in apps/remote (the apps share no package); the TV never shows that library.
 */
export function isPrivateLibrary(name: string | undefined): boolean {
  const plain = (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return plain === 'prive' || plain === 'private';
}

/** Merges lists of items into one shuffled list of at most `limit` items, without doubles. */
export function mergeShuffled<T extends { Id: string }>(lists: T[][], limit: number, random: () => number = Math.random): T[] {
  const seen: Record<string, true> = {};
  const all: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen[item.Id]) continue;
      seen[item.Id] = true;
      all.push(item);
    }
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = all[i];
    all[i] = all[j];
    all[j] = t;
  }
  return all.slice(0, limit);
}
