import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { useApp } from '../context';
import { describeQuickConnectError, digitsOnly, normalizeQuickConnectCode } from '../jellyfin/quickConnect';

type Status = 'idle' | 'busy' | 'ok' | 'error';

export const SUCCESS_MS = 1500;

/** Enter the Quick Connect code shown on the TV (or arrive here from the TV's QR code with the code filled in). */
export function ConnectTv({ initialCode, onBack }: { initialCode?: string; onBack: () => void }) {
  const { client, session, tv } = useApp();
  const [value, setValue] = useState(initialCode || '');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tvRef = useRef(tv);
  tvRef.current = tv;
  const backRef = useRef(onBack);
  backRef.current = onBack;

  const submit = async (raw: string) => {
    const code = normalizeQuickConnectCode(raw);
    if (!code) {
      setStatus('error');
      setError('Enter the 6 digits shown on the TV.');
      return;
    }
    setStatus('busy');
    setError('');
    try {
      await client.authorizeQuickConnect(code, session.userId);
      if (!alive.current) return;
      setStatus('ok');
      tvRef.current.reconnect();
      timer.current = setTimeout(() => backRef.current(), SUCCESS_MS);
    } catch (e) {
      if (!alive.current) return;
      setStatus('error');
      setError(describeQuickConnectError(e));
    }
  };

  useEffect(() => {
    alive.current = true;
    if (initialCode) void submit(initialCode);
    else input.current?.focus();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onInput = (e: Event) => {
    const digits = digitsOnly((e.target as HTMLInputElement).value);
    setValue(digits);
    if (status === 'error') setStatus('idle');
    if (digits.length === 6) void submit(digits);
  };

  const busy = status === 'busy';
  return (
    <main class="connect">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" size={26} />
      </button>
      {status === 'ok' ? (
        <div class="connect-body connect-done" role="status">
          <span class="connect-check">
            <Icon name="check" size={48} />
          </span>
          <h1>TV connected</h1>
          <p class="connect-lead">Your TV is ready. Pick something to watch on your phone.</p>
        </div>
      ) : (
        <div class="connect-body">
          <span class="connect-icon">
            <Icon name="tv" size={40} />
          </span>
          <h1>Connect your TV</h1>
          <p class="connect-lead">Enter the code shown on your TV.</p>
          {busy && initialCode && value === initialCode ? (
            <p class="connect-busy" role="status">
              Connecting...
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(value);
              }}
            >
              <input
                ref={input}
                class="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={7}
                placeholder="000000"
                aria-label="Code shown on the TV"
                value={value}
                disabled={busy}
                onInput={onInput}
              />
              {error ? (
                <p class="error connect-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" class="btn primary" disabled={busy || value.length < 6}>
                {busy ? 'Connecting...' : 'Connect'}
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
