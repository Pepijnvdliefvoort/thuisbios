import { useEffect, useRef, useState } from 'preact/hooks';
import { CalmBackground } from '../components/CalmBackground';
import { QrCode } from '../components/QrCode';
import { clientInfo } from '../clientInfo';
import { currentConnectUrl, currentJellyfinUrl } from '../config';
import { createClient } from '../jellyfin/client';
import type { Session } from '../jellyfin/types';
import { useRemote } from '../nav/useRemote';
import { POLL_MS, RETRY_MS, codeExpired, codeStale, formatCodeForDisplay } from '../quickConnect';

interface Props {
  onConnected(session: Session): void;
}

/**
 * Sign-in by Quick Connect, started on load. The phone app scans the QR code (or the code is typed
 * there) and authorizes it. Codes expire: a fresh one is requested silently. When the server cannot
 * be reached the screen says so and tries again every 10 seconds.
 */
export function ConnectScreen({ onConnected }: Props) {
  const serverUrl = currentJellyfinUrl();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const connected = useRef(onConnected);
  connected.current = onConnected;

  useRemote();

  useEffect(() => {
    if (!serverUrl) {
      setError("Can't work out where the Jellyfin server is. Open this page from the PC, or add ?server=http://<PC>:8096");
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const client = createClient({ serverUrl, info: clientInfo() });
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });

    async function run() {
      while (alive) {
        try {
          const state = await client.initiateQuickConnect();
          if (!alive) return;
          const issuedAt = Date.now();
          setCode(state.Code);
          setError('');
          let renew = false;
          while (alive && !renew) {
            await wait(POLL_MS);
            if (!alive) return;
            if (codeStale(issuedAt, Date.now())) break;
            try {
              const status = await client.checkQuickConnect(state.Secret);
              if (status.Authenticated) {
                const auth = await client.authenticateWithQuickConnect(state.Secret);
                if (!alive) return;
                connected.current({
                  serverUrl,
                  token: auth.AccessToken,
                  userId: auth.User.Id,
                  userName: auth.User.Name,
                });
                return;
              }
            } catch (e) {
              if (codeExpired(e)) renew = true;
              else throw e;
            }
          }
        } catch (e) {
          if (!alive) return;
          setCode(null);
          setError(`Can't reach the Jellyfin server at ${serverUrl}. Is the PC on?`);
          await wait(RETRY_MS);
        }
      }
    }
    run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [serverUrl]);

  const qrUrl = code ? currentConnectUrl(code) : '';

  return (
    <main class="connect">
      <CalmBackground />
      <div class="wordmark">Thuisbios</div>
      <div class="connect-body">
        {code ? (
          <>
            <div class="connect-text">
              <h1>Connect your phone</h1>
              <p>Scan the code with your phone, or open the Thuisbios app on your phone and enter this code.</p>
              <div class="code" aria-label={code.split('').join(' ')}>
                {formatCodeForDisplay(code).map((group, i) => (
                  <span class="code-group" key={i}>{group}</span>
                ))}
              </div>
            </div>
            {qrUrl && (
              <div class="qr-card">
                <QrCode text={qrUrl} size={360} />
              </div>
            )}
          </>
        ) : (
          <div class="connect-text connect-wait">
            <h1>{error ? 'Waiting for the server' : 'Getting ready'}</h1>
            {error ? <p class="error">{error}</p> : <p>One moment...</p>}
          </div>
        )}
      </div>
    </main>
  );
}
