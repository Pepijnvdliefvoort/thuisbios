import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * @typedef {{ host?: string, token?: string, volumeMode?: 'relative' }} TvConfig
 */

/** Path of the config file; `THUISBIOS_TV_CONFIG` overrides it. Never inside the repo. */
export function configPath(env = process.env) {
  return env.THUISBIOS_TV_CONFIG || join(homedir(), '.thuisbios', 'samsung-tv.json');
}

/** Port of the TV's secure remote WebSocket; `THUISBIOS_TV_PORT` overrides it (tests). */
export function tvPort(env = process.env) {
  const port = Number(env.THUISBIOS_TV_PORT);
  return Number.isInteger(port) && port > 0 ? port : 8002;
}

/** Port of the TV's UPnP media renderer (volume reading); `THUISBIOS_TV_UPNP_PORT` overrides it (tests). */
export function upnpPort(env = process.env) {
  const port = Number(env.THUISBIOS_TV_UPNP_PORT);
  return Number.isInteger(port) && port > 0 ? port : 9197;
}

/**
 * Reads the saved config (missing or broken file = empty). `THUISBIOS_TV_HOST` overrides the host.
 * @returns {TvConfig}
 */
export function loadConfig(env = process.env) {
  /** @type {TvConfig} */
  let config = {};
  try {
    const raw = JSON.parse(readFileSync(configPath(env), 'utf8'));
    if (raw && typeof raw === 'object') {
      if (typeof raw.host === 'string' && raw.host.trim()) config.host = raw.host.trim();
      if (typeof raw.token === 'string' && raw.token) config.token = raw.token;
      if (raw.volumeMode === 'relative') config.volumeMode = 'relative';
    }
  } catch {
    config = {};
  }
  const envHost = (env.THUISBIOS_TV_HOST || '').trim();
  if (envHost) {
    // A token belongs to one TV; do not reuse it for a different host.
    if (config.host && config.host !== envHost) delete config.token;
    config.host = envHost;
  }
  return config;
}

/**
 * Writes the config file (creating its folder). The token is kept private to the user where the OS allows.
 * @param {TvConfig} config
 */
export function saveConfig(config, env = process.env) {
  const file = configPath(env);
  mkdirSync(dirname(file), { recursive: true });
  /** @type {TvConfig} */
  const clean = {};
  if (config.host) clean.host = config.host;
  if (config.token) clean.token = config.token;
  if (config.volumeMode) clean.volumeMode = config.volumeMode;
  writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
}
