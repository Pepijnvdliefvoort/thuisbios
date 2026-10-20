// One-time setup of title suggestions in the request form. Usage: npm run jellyfin:setup -w apps/remote
import { createInterface } from 'node:readline/promises';
import { jellyfinConfigPath, jellyfinUrl, saveJellyfinApiKey } from '../relay/config.mjs';

const base = jellyfinUrl();

console.log('Title suggestions need a Jellyfin API key, so the app can look up posters and years.');
console.log('Create one in Jellyfin:');
console.log('  1. Open Jellyfin as the owner and go to Dashboard > API Keys.');
console.log('  2. Press the + button, name it "Thuisbios" and confirm.');
console.log('  3. Copy the key that appears in the list.');
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const apiKey = (await rl.question('Paste the API key here: ')).trim();
rl.close();

if (!apiKey) {
  console.error('No key entered. Run this again when you have the key.');
  process.exit(1);
}

try {
  const response = await fetch(`${base}/System/Info`, { headers: { Authorization: `MediaBrowser Token="${apiKey}"` } });
  if (response.status === 401 || response.status === 403) {
    console.error('Jellyfin did not accept this key. Check that you copied all of it, then run this again.');
    process.exit(1);
  }
  if (!response.ok) throw new Error(`status ${response.status}`);
} catch {
  console.error(`Can't reach Jellyfin at ${base}. Check that Jellyfin is running.`);
  console.error('If it is somewhere else, set THUISBIOS_JELLYFIN_URL (for example http://192.168.1.20:8096) and run this again.');
  process.exit(1);
}

saveJellyfinApiKey(apiKey);
console.log(`Jellyfin accepted the key. Saved to ${jellyfinConfigPath()} (outside the project, private to you).`);
console.log('Done. The request form now suggests titles with a poster and year. No restart needed.');
