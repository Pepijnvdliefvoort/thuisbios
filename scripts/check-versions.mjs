// Verifies that all versions in the repo agree.
// Extend this list when more app packages are added.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const readJson = (p) => JSON.parse(read(p));

/** Reads the version attribute of the root <widget> element of a Tizen config.xml. */
function widgetVersion(xml) {
  const match = /<widget\b[^>]*?\sversion="([^"]+)"/.exec(xml);
  return match ? match[1] : undefined;
}

const versions = {
  'package.json': readJson('package.json').version,
  '.release-please-manifest.json (".")': readJson('.release-please-manifest.json')['.'],
  'apps/tv/package.json': readJson('apps/tv/package.json').version,
  'apps/remote/package.json': readJson('apps/remote/package.json').version,
  'apps/tv/public/config.xml (widget version)': widgetVersion(read('apps/tv/public/config.xml')),
};

const unique = new Set(Object.values(versions));
for (const [file, v] of Object.entries(versions)) console.log(`${file}: ${v}`);

if (unique.size !== 1 || unique.has(undefined)) {
  console.error('Version mismatch between files.');
  process.exit(1);
}
console.log('Versions are consistent.');
