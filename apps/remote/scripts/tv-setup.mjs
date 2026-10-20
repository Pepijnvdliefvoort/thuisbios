// One-time pairing with the Samsung TV. Usage: npm run tv:setup -w apps/remote -- <tv-ip> [--test]
import { loadConfig, saveConfig, tvPort } from '../relay/config.mjs';
import { SamsungRemote } from '../relay/samsung.mjs';

const args = process.argv.slice(2);
const noTest = args.includes('--no-test');
const hostArg = args.find((a) => !a.startsWith('--'));
const saved = loadConfig();
const host = hostArg || saved.host;

if (!host) {
  console.log('Usage: npm run tv:setup -w apps/remote -- <tv-ip-address>');
  console.log('Example: npm run tv:setup -w apps/remote -- 192.168.1.156');
  console.log('Find the address on the TV: Settings > General > Network > Network Status > IP Settings.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A new address means a new TV: start without an old token.
const token = hostArg && hostArg !== saved.host ? undefined : saved.token;
saveConfig({ host, token });

let newToken = token;
const remote = new SamsungRemote({
  host,
  port: tvPort(),
  token,
  connectTimeoutMs: 60_000,
  onToken: (t) => {
    newToken = t;
    saveConfig({ host, token: t });
  },
});

console.log(`Connecting to the TV at ${host}...`);
console.log('Look at the TV and press Allow with the TV remote when the question appears.');
console.log('(Keep this window open. I wait up to one minute.)');

try {
  await remote.connect();
} catch (e) {
  const reason = e && e.message;
  if (e && e.code === 'not-allowed') {
    console.error('The TV did not allow the connection. Run this again and press Allow with the TV remote.');
    console.error('If you pressed Deny before: on the TV go to Settings > General > External Device Manager >');
    console.error('Device Connection Manager > Device List, set "Thuisbios Remote" to Allow (or remove it), then run this again.');
  } else if (reason === 'timeout') {
    console.error(`No answer from the TV at ${host} within a minute. Check that the TV is on, that the address is right,`);
    console.error('and that you pressed Allow on the TV. Then run this again.');
  } else {
    console.error(`Can't reach the TV at ${host}. Check that the TV is on and that the address is right.`);
  }
  remote.close();
  process.exit(1);
}

console.log(newToken ? 'The TV accepted the connection.' : 'The TV accepted the connection (it gave no token, that is fine).');

if (!noTest) {
  try {
    console.log('Testing: the volume goes up one step and then down one step. Listen to the TV.');
    await remote.sendKey('KEY_VOLUP');
    await sleep(800);
    await remote.sendKey('KEY_VOLDOWN');
    await sleep(300);
  } catch {
    console.error('The TV connected but did not accept the volume keys. Run this again and press Allow.');
    remote.close();
    process.exit(1);
  }
}
remote.close();
console.log('Paired. The volume buttons on the phone now work.');
