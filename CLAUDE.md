# Instructions for AI sessions

Thuisbios: personal Netflix-like streaming on top of Jellyfin. Read [README.md](README.md) and
[docs/plan.md](docs/plan.md) first.

## Working model

- Opus plans and orchestrates. Implementation is delegated to Sonnet subagents.
- Keep tasks small and reviewable; one concern per branch and PR.

## Git workflow

- Conventional Commits for every commit (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `perf:`, `test:`).
- Create feature branches off `develop`: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `ci/...`, `refactor/...`, `perf/...`, `test/...`.
- Never push to an automatically assigned `claude/*` branch. Always create a branch named `feat/...`, `fix/...`, `ci/...` etc. off `develop`; CI rejects PRs from other branch names.
- Open PRs into `develop`. The PR title must also be a Conventional Commit.
- `main` is stable releases only, updated by a release PR from `develop` and tagged `vX.Y.Z`. Never commit to `main` directly.
- Never merge PRs. The owner approves and merges every PR.
- No AI attribution anywhere: no Co-Authored-By or session trailers, no "generated with" lines in commits, PRs or comments. Commits are authored as `Pepijnvdliefvoort <25536220+Pepijnvdliefvoort@users.noreply.github.com>`.
- Use the PR template in `.github/pull_request_template.md`.

## Every change

- Check that README.md is still accurate (layout, roadmap status, CI overview) and update it in the same PR.
- Keep versions consistent (`node scripts/check-versions.mjs`) and run `npx markdownlint-cli2` for docs changes.
- CI must be green before asking for review.

## Security

- Never commit secrets, `.env` files, API keys, Jellyfin tokens, or Tizen certificates (`*.p12`, `.sign`, `author*.xml`, `*.wgt`).
- Never commit test media.

## TV app constraints (apps/tv)

- Target Tizen 4.0 (2018 Samsung UE49NU7100), Chromium 56. Compile to ES2017 or lower with polyfills; no `?.`, `??` or class fields at runtime.
- Avoid `backdrop-filter`, heavy blur and big shadows; animate only transform and opacity.
- Lazy-load rows, request images at the exact size needed.
- D-pad spatial navigation is core UX; register remote keys via `tizen.tvinputdevice`.
- Playback: HTML5 video first with a Jellyfin device profile (no AV1, no DTS/TrueHD); AVPlay only if needed.
