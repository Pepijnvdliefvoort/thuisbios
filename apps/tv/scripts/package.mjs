// Packages dist/ into a signed .wgt with the Tizen CLI. Signing needs a Samsung certificate profile
// created with the Tizen VS Code extension (or the CLI), so this cannot run in CI. See docs/tv/dev-setup.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const profile = process.env.TIZEN_PROFILE;
const dist = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../build/', import.meta.url).pathname;

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build -w apps/tv` first.');
  process.exit(1);
}
if (!profile) {
  console.error(
    'Set TIZEN_PROFILE to the name of your signing profile (Tizen extension > Certificate Manager), e.g.\n' +
      '  TIZEN_PROFILE=thuisbios npm run package -w apps/tv\n' +
      'No Tizen CLI? Use Run Project in the Tizen VS Code extension instead: see docs/tv/dev-setup.md.',
  );
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const result = spawnSync('tizen', ['package', '-t', 'wgt', '-s', profile, '-o', out, '--', dist], {
  stdio: 'inherit',
});
if (result.error) {
  console.error('Could not run the `tizen` command. Install "Tizen SDK 10 with CLI installer" and add its tools/ide/bin folder to your PATH.');
  process.exit(1);
}
process.exit(result.status ?? 1);
