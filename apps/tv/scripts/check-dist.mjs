// Fails when the built JavaScript contains syntax Chromium 56 (Tizen 4.0) cannot run:
// optional chaining, nullish coalescing, class fields, object spread and so on.
// Parsing as ES2017 rejects all of them without false hits on regexes or strings.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';

const dist = new URL('../dist/', import.meta.url).pathname;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failed = false;
let count = 0;
for (const file of walk(dist)) {
  if (!file.endsWith('.js')) continue;
  count++;
  try {
    parse(readFileSync(file, 'utf8'), { ecmaVersion: 2017, sourceType: 'script' });
  } catch (error) {
    failed = true;
    console.error(`${file}: not valid ES2017: ${error.message}`);
  }
}
if (count === 0) {
  console.error('No JavaScript found in dist/. Run the build first.');
  process.exit(1);
}
if (failed) process.exit(1);
console.log(`Checked ${count} JavaScript file(s): ES2017 syntax only.`);
