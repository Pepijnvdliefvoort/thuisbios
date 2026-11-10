import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildAssetList, cacheVersion, renderWorker } from './assets.mjs';

const template = readFileSync(new URL('./worker.template.js', import.meta.url), 'utf8');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Writes `sw.js` into the build output: a service worker that precaches every emitted file (JS, CSS,
 * index.html, manifest, icons) so the app opens offline. Runs in writeBundle, after Vite copied public/.
 * The server must send sw.js with `Cache-Control: no-cache` (done for `vite preview` below).
 */
export function swPlugin() {
  let outDir = 'dist';
  const noCache = (server) => {
    server.middlewares.use((req, res, next) => {
      if ((req.url || '').split('?')[0].endsWith('/sw.js')) res.setHeader('Cache-Control', 'no-cache');
      next();
    });
  };
  return {
    name: 'thuisbios-sw',
    configResolved(config) {
      outDir = config.build.outDir;
      if (!outDir.startsWith('/')) outDir = join(config.root, outDir);
    },
    writeBundle() {
      const files = walk(outDir).map((f) => relative(outDir, f).split(sep).join('/'));
      const assets = buildAssetList(files);
      const version = cacheVersion(assets.map((name) => [name, readFileSync(join(outDir, name))]));
      writeFileSync(join(outDir, 'sw.js'), renderWorker(template, assets, version));
    },
    configurePreviewServer: noCache,
  };
}
