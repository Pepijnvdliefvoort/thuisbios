# README screenshots

Generates the images in `docs/images/` (phone and TV screenshots plus the banner) from a fake
Jellyfin server, so no real movie or show ever appears. All content is generic placeholder data
("Sample Film 01", "Sample Series A") with generated SVG artwork.

- `mock-jellyfin.mjs`: zero-dependency fake Jellyfin API on port 8097. Run it alone with
  `node scripts/screenshots/mock-jellyfin.mjs` to try the apps against it. It also serves a tiny HLS stream
  (six 2-second segments made in memory with ffmpeg when it is installed, stub bytes otherwise) for a forced
  transcode, so the phone app's offline downloads can be tried. It also accepts the resume-position endpoint the phone uses to sync offline progress; with `MOCK_LOG=1` it prints every write request. Nothing is written to the repository.
- `capture.mjs`: starts the mock, takes the screenshots with Playwright and shrinks the PNGs.
- `banner.html`: the banner, rendered by `capture.mjs` to `docs/images/banner.png`.
- `optimize.py`: optional PNG shrinker (needs Python with Pillow).
- `revert-noise.py`: restores regenerated PNGs that differ from the committed ones by at most 8 per channel (invisible raster noise), so the workflow does not report them as changed.

## Regenerate

Playwright with a Chromium must be installed globally (it is not a project dependency).

```bash
node scripts/screenshots/capture.mjs                  # everything
node scripts/screenshots/capture.mjs phone-home banner  # only some shots
```

The script starts `npm run dev -w apps/remote` (port 5174) and `npm run dev -w apps/tv`
(port 5173) when they are not running yet. Set `PLAYWRIGHT_CHROMIUM` to use another browser binary.

The workflow `.github/workflows/readme-screenshots.yml` runs this on the `develop` to `main` release PR
(when it is opened and on every update, and on demand). When the images changed it force-pushes
`docs/readme-screenshots`, opens a PR into `develop` (or updates the open one) and fails the check until
that PR is merged (Squash and merge); the check then re-runs and turns green. It can be made a required
check on the `main` ruleset so the release PR cannot be merged too early. Runner fonts can differ from the committed
images, so the first run may touch every image. The capture is deterministic on one machine: animations
are frozen at a fixed time and the screensaver clock uses a fixed date.
