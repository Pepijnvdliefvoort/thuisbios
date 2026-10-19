import { useEffect, useRef, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import { normalizeServerUrl } from '../jellyfin/auth';
import { createClient, type JellyfinClient } from '../jellyfin/client';
import type { Session } from '../jellyfin/types';
import { focusFirst, useRemote } from '../nav/useRemote';
import { loadServerUrl, saveServerUrl } from '../storage';

interface Props {
  onConnected(session: Session): void;
}

const POLL_MS = 3000;

export function ConnectScreen({ onConnected }: Props) {
  const [url, setUrl] = useState(loadServerUrl() || import.meta.env.VITE_JELLYFIN_URL || '');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pollTimer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);

  useRemote();
  useEffect(() => {
    focusFirst();
    return () => {
      cancelled.current = true;
      window.clearInterval(pollTimer.current);
    };
  }, []);

  const stop = () => {
    window.clearInterval(pollTimer.current);
    setCode(null);
  };

  async function start() {
    const serverUrl = normalizeServerUrl(url);
    if (!serverUrl) {
      setError('Type the server address first, for example http://192.168.1.50:8096');
      return;
    }
    setError('');
    saveServerUrl(serverUrl);
    let client: JellyfinClient;
    try {
      client = createClient({ serverUrl, info: clientInfo() });
      const state = await client.initiateQuickConnect();
      setCode(state.Code);
      let busy = false;
      pollTimer.current = window.setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          const status = await client.checkQuickConnect(state.Secret);
          if (status.Authenticated && !cancelled.current) {
            window.clearInterval(pollTimer.current);
            const auth = await client.authenticateWithQuickConnect(state.Secret);
            onConnected({
              serverUrl,
              token: auth.AccessToken,
              userId: auth.User.Id,
              userName: auth.User.Name,
            });
          }
        } catch (e) {
          window.clearInterval(pollTimer.current);
          setCode(null);
          setError(`Quick Connect failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          busy = false;
        }
      }, POLL_MS);
    } catch (e) {
      setCode(null);
      setError(
        `Could not start Quick Connect: ${e instanceof Error ? e.message : String(e)}. ` +
          'Check the address and that Quick Connect is enabled on the server.',
      );
    }
  }

  return (
    <main class="screen connect">
      <h1>Thuisbios</h1>
      {code === null ? (
        <>
          <label for="server">Jellyfin server</label>
          <input
            id="server"
            data-focusable
            type="url"
            value={url}
            placeholder="http://192.168.1.50:8096"
            onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          />
          <button data-focusable class="btn" onClick={start}>
            Connect with Quick Connect
          </button>
        </>
      ) : (
        <>
          <p>On your phone open Jellyfin, then Settings, Quick Connect, and type this code:</p>
          <div class="code">{code}</div>
          <p class="muted">Waiting for approval...</p>
          <button data-focusable class="btn" ref={(el) => { if (el) el.focus(); }} onClick={stop}>
            Cancel
          </button>
        </>
      )}
      {error && <p class="error">{error}</p>}
    </main>
  );
}
