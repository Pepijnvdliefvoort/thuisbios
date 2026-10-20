import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { tvRelayPlugin } from './relay/plugin.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Relative base: the build works from any path (and later inside a Capacitor shell).
  base: './',
  // The Samsung TV volume relay runs inside `vite dev` and `vite preview` (docs/remote/setup.md).
  plugins: [tvRelayPlugin()],
  // `.ts.net` lets the app be opened through Tailscale Serve (docs/remote/tailscale.md).
  server: { port: 5174, allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { sourcemap: false },
  test: { include: ['src/**/*.test.ts', 'relay/**/*.test.ts'] },
});
