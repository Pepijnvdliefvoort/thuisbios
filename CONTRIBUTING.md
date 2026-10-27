# Contributing

## Branches

1. Branch off `develop`: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `ci/<topic>`, `refactor/<topic>`, `perf/<topic>`, `test/<topic>`.
   CI rejects PRs from any other branch name (release-please, Dependabot and the automatic `main` sync PR are exempt).
2. Open a PR into `develop`. The owner reviews and approves every PR.

## Commits and PR titles

Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`.
Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.
Commitlint checks all commits in a PR and the PR title. Squash merges use the PR title.

## Pull requests

- Fill in the PR template (summary, how, checklist).
- Check that the README is still up to date.
- CI (commitlint, markdownlint, version check) must be green.

## Releases

1. When `develop` is ready, open a PR from `develop` into `main` (a merge commit, not a squash).
2. After it is merged, release-please opens a release PR on `main` with the version bump and changelog. The first release is 0.1.0 (`initial-version` in `release-please-config.json`).
3. The owner merges the release PR; release-please tags `vX.Y.Z` and creates the GitHub release.
4. The release workflow then opens a PR from `main` back into `develop` so the version and changelog flow back.

## Docker

Docker image builds (GHCR) will be added with the first containerized service.

## Local checks

```sh
npm install
npx markdownlint-cli2
node scripts/check-versions.mjs
echo "feat: example" | npx commitlint
```
