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
scripts/                  repo tooling (version checks)
packages/jellyfin-client/ planned: shared typed Jellyfin API client
apps/tv/                  planned: Samsung Tizen 4.0 TV app (Preact + TypeScript + Vite)
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

- `ci.yml`: commitlint (commits and PR title), markdownlint, version consistency check, PowerShell
  (PSScriptAnalyzer and Pester tests for `server/` on Windows).
- `release-please.yml`: on push to `main`, opens or updates the release PR and creates tags and releases.
- `sync-develop.yml`: after a release, opens a PR from `main` back into `develop`.

Dependabot updates GitHub Actions and npm weekly, targeting `develop`.
Docker image builds (GHCR) and the other test jobs are added together with the first containerized service or code.

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1. Server | Jellyfin on the Windows PC with a test library | scripts and guide ready; owner follows [docs/server/windows-setup.md](docs/server/windows-setup.md) |
| 2. TV spike | Hello-world Tizen app, D-pad focus, direct play and transcode playback | planned |
| 3. TV MVP | Quick Connect login, profiles, home rows, detail page, playback with resume | planned |
| 4. Phone remote MVP | Search, browse, play on TV, transport controls, volume to the soundbar | planned |
| 5. Polish | Series flow, subtitles, trickplay, Samsung power-on/launch, remote access | planned |
