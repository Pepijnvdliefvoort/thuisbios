# README screenshots

Generates the images in `docs/images/` (phone and TV screenshots plus the banner) from a fake
Jellyfin server, so no real movie or show ever appears. All content is generic placeholder data
("Sample Film 01", "Sample Series A") with generated SVG artwork.

- `mock-jellyfin.mjs`: zero-dependency fake Jellyfin API on port 8097. Run it alone with
  `node scripts/screenshots/mock-jellyfin.mjs` to try the apps against it.
- `capture.mjs`: starts the mock, takes the screenshots with Playwright and shrinks the PNGs.
- `banner.html`: the banner, rendered by `capture.mjs` to `docs/images/banner.png`.
- `optimize.py`: optional PNG shrinker (needs Python with Pillow).

## Regenerate

Playwright with a Chromium must be installed globally (it is not a project dependency).

```bash
node scripts/screenshots/capture.mjs                  # everything
node scripts/screenshots/capture.mjs phone-home banner  # only some shots
```

The script starts `npm run dev -w apps/remote` (port 5174) and `npm run dev -w apps/tv`
(port 5173) when they are not running yet. Set `PLAYWRIGHT_CHROMIUM` to use another browser binary.
