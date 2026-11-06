import { useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import { defaultServerUrl, normalizeServerUrl } from '../jellyfin/auth';
import { authenticateByName } from '../jellyfin/client';
import { describeSignInError, isServerAddressError } from '../jellyfin/errors';
import type { Session } from '../jellyfin/types';
import { loadServerUrl, saveServerUrl } from '../storage';
import { useDesktop } from '../useDesktop';

/** Desktop backdrop: columns of abstract poster tiles. Hue, column offset and tile heights come from a fixed pattern, so it never changes between renders. */
const WALL_HUES = [350, 262, 215, 28, 335, 190, 12, 285, 232, 45];
const WALL_COLUMNS = Array.from({ length: 14 }, (_, c) => ({
  offset: (c * 97) % 230,
  tiles: Array.from({ length: 9 }, (_, t) => ({ hue: WALL_HUES[(c * 3 + t * 7 + ((c * t) % 4)) % WALL_HUES.length], tone: (c + t * 2) % 3 })),
}));

function Wall() {
  return (
    <div class="signin-wall" aria-hidden="true">
      {WALL_COLUMNS.map((col, c) => (
        <div key={c} class="wall-col" style={{ marginTop: `-${col.offset}px` }}>
          {col.tiles.map((tile, t) => (
            <span key={t} class={`wall-tile tone-${tile.tone}`} style={{ '--h': String(tile.hue) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SignIn({
  onSignedIn,
  connecting,
  expired,
}: {
  onSignedIn: (session: Session) => void;
  connecting?: boolean;
  expired?: boolean;
}) {
  const [server, setServer] = useState(
    () => loadServerUrl() || defaultServerUrl(import.meta.env.VITE_JELLYFIN_URL, window.location),
  );
  const [showServer, setShowServer] = useState(() => !server);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const desktop = useDesktop();

  const submit = async (event: Event) => {
    event.preventDefault();
    const serverUrl = normalizeServerUrl(server);
    if (!serverUrl || !username.trim()) {
      setError(showServer ? 'Fill in the server address and your username.' : 'Fill in your username.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authenticateByName({ serverUrl, info: clientInfo() }, username.trim(), password);
      saveServerUrl(serverUrl);
      onSignedIn({ serverUrl, token: result.AccessToken, userId: result.User.Id, userName: result.User.Name });
    } catch (e) {
      setError(describeSignInError(e));
      if (isServerAddressError(e)) setShowServer(true);
      setBusy(false);
    }
  };

  const page = (
    <main class="signin">
      <div class="signin-logo">Thuisbios</div>
      {connecting ? (
        <p class="signin-banner" role="status">
          Sign in to connect your TV
        </p>
      ) : expired ? (
        <p class="signin-banner" role="status">
          You were signed out. Please sign in again.
        </p>
      ) : null}
      <p class="signin-lead">Sign in to control your TV.</p>
      <form onSubmit={submit}>
        {showServer ? (
          <label>
            Server
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellcheck={false}
              value={server}
              onInput={(e) => setServer((e.target as HTMLInputElement).value)}
              placeholder="http://192.168.1.50:8096"
            />
          </label>
        ) : null}
        <label>
          Username
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" class="btn primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      {showServer ? null : (
        <button type="button" class="signin-link" onClick={() => setShowServer(true)}>
          Change server
        </button>
      )}
    </main>
  );
  // Desktop: the same page as a card over a drifting wall of poster tiles.
  return desktop ? (
    <div class="signin-stage">
      <Wall />
      {page}
    </div>
  ) : (
    page
  );
}
