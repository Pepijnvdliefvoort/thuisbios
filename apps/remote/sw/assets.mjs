import { createHash } from 'node:crypto';

/** Files that must not be precached. */
const SKIP = /(^|\/)(sw\.js|.*\.map)$/;

/** Sorted, de-duplicated list of the files to precache (paths relative to the dist root). */
export function buildAssetList(fileNames) {
  return [...new Set(fileNames.filter((name) => !SKIP.test(name)))].sort();
}

/** Short cache version: a hash of the list plus the content of every file, so any change gives a new cache. */
export function cacheVersion(entries) {
  const hash = createHash('sha256');
  for (const [name, content] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    hash.update(name);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Fills the worker template with the asset list and version. */
export function renderWorker(template, assets, version) {
  return template.replace('__VERSION__', () => JSON.stringify(version)).replace('__ASSETS__', () => JSON.stringify(assets));
}
