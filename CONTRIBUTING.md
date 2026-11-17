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

### Automatic merge of release PRs

Without setup, the owner merges the release PR (squash) and the back-merge PR (merge commit) by hand.
To let them merge themselves once their checks pass:

1. Create a fine-grained personal access token (GitHub > Settings > Developer settings). Limit it to this
   repository only, with Contents: Read and write and Pull requests: Read and write. Workflows is not needed.
2. Add it under Settings > Secrets and variables > Actions as a repository secret named `RELEASE_TOKEN`.
3. Turn on Settings > General > "Allow auto-merge".

The token is needed because PRs and merges made with the default `GITHUB_TOKEN` do not trigger other
workflows: the PR would get no CI, and merging the release PR would not start the release workflow on `main`,
so no tag or release would be created. The release PR is squash merged, the back-merge PR gets a merge commit.
Remove the secret to go back to merging by hand.

## Docker

Docker image builds (GHCR) will be added with the first containerized service.

## Local checks

```sh
npm install
npx markdownlint-cli2
node scripts/check-versions.mjs
echo "feat: example" | npx commitlint
```
