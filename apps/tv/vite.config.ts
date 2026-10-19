import { readFileSync } from 'node:fs';
import legacy from '@vitejs/plugin-legacy';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// The app is opened from file:// on the TV; script tags with `crossorigin` can fail there.
const stripCrossorigin = (): Plugin => ({
  name: 'thuisbios-strip-crossorigin',
  enforce: 'post',
  transformIndexHtml: (html) => html.replace(/\s+crossorigin(="[^"]*")?/g, ''),
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { cssTarget: 'chrome56', sourcemap: false },
  plugins: [
    // Samsung Tizen 4.0 ships Chromium 56: emit only the transpiled + polyfilled legacy bundle.
    legacy({ targets: ['chrome 56'], renderModernChunks: false }),
    stripCrossorigin(),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
