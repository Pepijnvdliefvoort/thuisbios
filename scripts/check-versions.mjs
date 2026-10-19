// Verifies that all versions in the repo agree.
// Extend this list when apps/tv (config.xml) and app packages are added.
import { readFileSync } from 'node:fs';

const readJson = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

const versions = {
  'package.json': readJson('package.json').version,
  '.release-please-manifest.json (".")': readJson('.release-please-manifest.json')['.'],
};

const unique = new Set(Object.values(versions));
for (const [file, v] of Object.entries(versions)) console.log(`${file}: ${v}`);

if (unique.size !== 1) {
  console.error('Version mismatch between files.');
  process.exit(1);
}
console.log('Versions are consistent.');
