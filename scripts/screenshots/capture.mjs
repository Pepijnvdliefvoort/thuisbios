// Takes the README screenshots against the fake Jellyfin in mock-jellyfin.mjs (no real library involved).
//
//   npm run dev -w apps/remote      # phone app on http://localhost:5174 (started here when not running)
//   npm run dev -w apps/tv          # TV app on http://localhost:5173 (started here when not running)
//   node scripts/screenshots/capture.mjs [shot ...]
//
// Writes PNGs to docs/images/. Pass shot names (phone-home, phone-details, phone-now-playing,
// phone-search, phone-library, phone-connect, tv-connect, tv-screensaver, banner) to take only those.
// Needs Playwright with a Chromium (global install); set PLAYWRIGHT_CHROMIUM to point at another binary.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMock, SAMPLE } from './mock-jellyfin.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('../../docs/images/', import.meta.url));
const MOCK_PORT = 8097;
const REMOTE_URL = 'http://localhost:5174';
const TV_URL = 'http://localhost:5173';
const MOCK_URL = `http://localhost:${MOCK_PORT}`;
const wanted = process.argv.slice(2);
const want = (name) => wanted.length === 0 || wanted.includes(name);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];

async function isUp(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

/** Starts a dev server unless something already answers on its port. */
async function ensureServed(workspace, url) {
  if (await isUp(url)) return;
  console.log(`starting ${workspace} dev server`);
  const child = spawn('npm', ['run', 'dev', '-w', workspace], { cwd: root, stdio: 'ignore', detached: true });
  children.push(child);
  for (let i = 0; i < 60; i++) {
    if (await isUp(url)) return;
    await sleep(500);
  }
  throw new Error(`${workspace} did not come up on ${url}`);
}

/** Network idle, then every visible <img> has loaded (lazy images below the fold are skipped). */
async function settle(page, extraMs = 400) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForFunction(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    return Array.from(document.images).every((img) => {
      const r = img.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width > 0;
      return !visible || (img.complete && img.naturalWidth > 0);
    });
  }, null, { timeout: 15000 });
  await sleep(extraMs);
}

async function shot(page, name) {
  await page.screenshot({ path: `${out}${name}.png` });
  console.log(`wrote docs/images/${name}.png`);
}

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

const session = { serverUrl: MOCK_URL, token: SAMPLE.token, userId: SAMPLE.user.Id, userName: SAMPLE.user.Name };

/** A signed-in phone page. `noTv` hides the fake TV session, so the app offers "Connect TV". */
async function phonePage(browser, { noTv = false } = {}) {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(([key, value, serverKey, server]) => {
    localStorage.setItem(key, value);
    localStorage.setItem(serverKey, server);
  }, ['thuisbios.remote.session', JSON.stringify(session), 'thuisbios.remote.serverUrl', MOCK_URL]);
  // The phone server's relay (/api/...) reads local files: keep screenshots independent of it.
  await context.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  if (noTv) {
    await context.route(`${MOCK_URL}/Sessions?*`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }),
    );
  }
  const page = await context.newPage();
  await page.goto(REMOTE_URL);
  return page;
}

async function main() {
  mkdirSync(out, { recursive: true });
  const mock = await startMock({ port: MOCK_PORT });
  const phoneShots = ['phone-home', 'phone-details', 'phone-now-playing', 'phone-search', 'phone-library'].some(want);
  const tvShots = ['tv-connect', 'tv-screensaver'].some(want);
  if (phoneShots || want('phone-connect')) await ensureServed('apps/remote', REMOTE_URL);
  if (tvShots) await ensureServed('apps/tv', TV_URL);

  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  );
  try {
    if (phoneShots) {
      const page = await phonePage(browser);
      await page.waitForSelector('.card-poster');
      await settle(page);
      if (want('phone-home')) await shot(page, 'phone-home');

      if (want('phone-details')) {
        await page.locator('.card-poster', { hasText: 'Sample Series A' }).first().click();
        await page.waitForSelector('.ep-list .ep');
        await settle(page);
        // Scroll the episode list into view.
        await page.evaluate(() => {
          const s = document.querySelector('.scroller');
          const h = document.querySelector('.episodes h2');
          if (s && h) s.scrollTop = h.getBoundingClientRect().top + s.scrollTop - 450;
        });
        await settle(page, 600);
        await shot(page, 'phone-details');
        await page.goBack();
        await page.waitForSelector('.card-poster');
      }

      if (want('phone-now-playing')) {
        await page.locator('.mini-open').click();
        await page.waitForSelector('.nowplaying .np-text');
        await settle(page, 800);
        await shot(page, 'phone-now-playing');
        await page.goBack();
      }

      if (want('phone-search')) {
        await page.locator('.tabbar button', { hasText: 'Search' }).click();
        await page.fill('.searchbox input', 'Sample Film');
        await page.waitForSelector('.grid .card, .grid .card-poster', { timeout: 10000 }).catch(() => undefined);
        await settle(page, 600);
        await page.locator('.searchbox input').blur();
        await shot(page, 'phone-search');
      }

      if (want('phone-library')) {
        await page.locator('.tabbar button', { hasText: 'Library' }).click();
        await page.waitForSelector('.segmented');
        await settle(page, 600);
        await shot(page, 'phone-library');
      }
      await page.context().close();
    }

    if (want('phone-connect')) {
      const page = await phonePage(browser, { noTv: true });
      await page.waitForSelector('.tv-btn.is-connect');
      await page.locator('.tv-btn.is-connect').click();
      await page.waitForSelector('.code-input');
      await page.locator('.code-input').pressSequentially('48291', { delay: 30 });
      await settle(page, 300);
      await shot(page, 'phone-connect');
      await page.context().close();
    }

    if (want('tv-connect')) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const remote = encodeURIComponent('http://thuisbios.local:4174');
      await page.goto(`${TV_URL}/?server=${encodeURIComponent(MOCK_URL)}&remote=${remote}`);
      await page.waitForSelector('.code');
      await settle(page, 5000); // let the background animation drift into a nice frame
      await shot(page, 'tv-connect');
      await context.close();
    }

    if (want('tv-screensaver')) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ['thuisbios.session', JSON.stringify(session)]);
      const page = await context.newPage();
      await page.goto(`${TV_URL}/?server=${encodeURIComponent(MOCK_URL)}`);
      await page.waitForSelector('.ss-img');
      await settle(page, 4000);
      await shot(page, 'tv-screensaver');
      await context.close();
    }

    if (want('banner')) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const file = fileURLToPath(new URL('./banner.html', import.meta.url));
      await page.goto(`${pathToFileURL(file).href}?mock=${encodeURIComponent(MOCK_URL)}`);
      await settle(page, 300);
      await shot(page, 'banner');
      await context.close();
    }
  } finally {
    await browser.close();
    await mock.close();
    // Keep each PNG small (needs python3 with Pillow; skipped when missing).
    spawnSync('python3', [fileURLToPath(new URL('./optimize.py', import.meta.url)), out], { stdio: 'inherit' });
    for (const c of children) process.kill(-c.pid); // the whole npm process group
  }
}

if (!existsSync(root + 'package.json')) throw new Error('run from the repository');
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
