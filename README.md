# Thuisbios

Thuisbios ("home cinema") is a personal, Netflix-like way to stream my own media at home.
[Jellyfin](https://jellyfin.org) is the backend. Two custom clients are built on top of its API:
a Samsung Tizen TV app and a phone remote PWA that controls the TV.

Full plan: [docs/plan.md](docs/plan.md).

## Architecture

```text
 Phone remote ──HTTP + WebSocket──▶ Jellyfin (Windows PC) ◀──HTTP + WebSocket── TV app
 (PWA)                              NVIDIA RTX 4060 Ti                          (Samsung Tizen 4.0)
      │                             NVENC transcoding                                  ▲
      └──── optional: relay service ──▶ Samsung TV control API (volume, power, launch) ┘
```

Jellyfin handles users, library, metadata, progress, search, image resizing, transcoding and the
sessions (remote control) API. The phone sends commands to the TV session through Jellyfin.

## Repository layout

```text
.github/                  CI, release and dependency automation, PR template
docs/plan.md              project plan
docs/server/              Jellyfin setup guide for Windows (windows-setup.md)
docs/tv/                  TV app: Tizen setup, install and test guide (dev-setup.md)
scripts/                  repo tooling (version checks)
packages/jellyfin-client/ planned: shared typed Jellyfin API client
apps/tv/                  Samsung Tizen 4.0 TV app, phase 2 spike (Preact + TypeScript + Vite)
apps/remote/              planned: phone remote PWA (Preact + TypeScript + Vite)
services/relay/           planned: optional ASP.NET Core relay for Samsung TV control
server/                   Jellyfin helper scripts (PowerShell) and Pester tests; device profile planned
```

## Server (phase 1)

Follow [docs/server/windows-setup.md](docs/server/windows-setup.md) to install Jellyfin natively
on Windows, enable NVENC, and set up the network. Helper scripts live in `server/scripts`
(Windows PowerShell 5.1 or PowerShell 7):

- `New-MediaLibrary.ps1`: create the Movies/Shows folders.
- `Get-TestMedia.ps1`: download Blender open movies and build a Jellyfin test library (needs ffmpeg).
- `Set-JellyfinFirewall.ps1`: allow TCP 8096 and UDP 7359 on the private network (administrator).
- `Test-JellyfinServer.ps1`: check that the server answers.

Run the tests with `Invoke-Pester -Path server/tests` (Pester 5).

## TV app (phase 2 spike)

`apps/tv` is an npm workspace package: Preact + TypeScript + Vite, transpiled for Chromium 56
(Tizen 4.0) with `@vitejs/plugin-legacy`. The spike has a Quick Connect sign-in and a Netflix-style home screen: a hero billboard for the
featured item (it follows the focused tile) above rows of Continue watching, Next up, recently
added movies and series, and all movies and series. OK on a tile opens a details page (movie,
episode, or series with a season selector and episode list) with Play, Resume and Play from start,
so playback resumes where it stopped. Pressing Left from the first column opens a sidebar (Home,
Movies, Shows, Sign out) over a narrow icon rail; Movies and Shows are poster grids of the whole
library, and Return goes back to Home. Items without a backdrop show a generic dark background
instead of the previous image. Navigation is a (row, column) grid driven by the D-pad or by
the TV browser's arrow-driven pointer. The player is a Netflix-style HTML5 player (one input state
machine for the remote's pointer and the keyboard, Jellyfin device profile, `?debug` overlay) with
text subtitles (CC button). In the TV browser, Return while in full screen only leaves full screen,
so the app treats that as a back step (details to home, player to details) and asks for full screen
again; full screen only ends for good on the home screen. While the page is not in full screen, the TV browser shows a modal over the whole page ("Press OK to
continue in full screen"); OK then only enters full screen and the arrows do not move the focus behind it.
If the browser refuses full screen twice in a row after OK, the modal is turned off for the rest of the session; the OK press is swallowed for a second so it never starts a movie. The `?debug` overlay shows these
decisions. Follow [docs/tv/dev-setup.md](docs/tv/dev-setup.md) to install
it on the TV and run the test checklist. If the TV refuses the install, the same guide explains
how to run the app in the TV's web browser (`npm run preview -w apps/tv`, served on port 4173).

```bash
npm install
npm run dev -w apps/tv        # desktop browser at http://localhost:5173
npm test                      # unit tests of all workspaces
npm run typecheck             # tsc --noEmit in all workspaces
npm run build -w apps/tv      # apps/tv/dist, ready to package for Tizen
npm run check:dist -w apps/tv # build output must be ES2017 only
```

Signing and packaging (`npm run package -w apps/tv`) need the Tizen CLI and a Samsung
certificate, so they run on the owner's PC, never in CI. Certificates and `.wgt` files are never
committed.

## Branching and releases

- `develop` is the continuously evolving integration branch.
- Work happens on feature branches off `develop`: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `ci/...`.
- Pull requests go into `develop`. The owner approves every PR.
- `main` holds stable releases only. It is updated by a release PR from `develop`, tagged `vX.Y.Z` (semver).
- [release-please](https://github.com/googleapis/release-please) maintains the changelog and version bump.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint:
`feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `ci: ...`, `refactor: ...`, `perf: ...`, `test: ...`.

## CI overview

GitHub Actions in `.github/workflows`:

- `ci.yml`: commitlint (commits and PR title), markdownlint, version consistency check (root,
  `apps/tv/package.json` and the Tizen `config.xml` must agree), TV app (typecheck, Vitest, build,
  ES2017 syntax check, `dist` uploaded as artifact), PowerShell (PSScriptAnalyzer and Pester tests
  for `server/` on Windows).
- `release-please.yml`: on push to `main`, opens or updates the release PR and creates tags and releases.
- `sync-develop.yml`: after a release, opens a PR from `main` back into `develop`.

Dependabot updates GitHub Actions and npm weekly, targeting `develop`.
Docker image builds (GHCR) and the other test jobs are added together with the first containerized service.

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1. Server | Jellyfin on the Windows PC with a test library | done |
| 2. TV spike | Hello-world Tizen app, D-pad focus, direct play and transcode playback | in progress: app built, owner tests on the TV with [docs/tv/dev-setup.md](docs/tv/dev-setup.md) |
| 3. TV MVP | Quick Connect login, profiles, home rows, detail page, playback with resume | planned |
| 4. Phone remote MVP | Search, browse, play on TV, transport controls, volume to the soundbar | planned |
| 5. Polish | Series flow, subtitles, trickplay, Samsung power-on/launch, remote access | planned |
