import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { Icon } from './Icon';

/** Header chip showing the connected TV; tap to pick another one. */
export function TvChip({ onSignOut }: { onSignOut: () => void }) {
  const { tv, session } = useApp();
  const [open, setOpen] = useState(false);
  const connected = !!tv.tv;
  const name = tv.tv ? tv.tv.DeviceName || 'TV' : tv.loaded ? 'No TV' : 'Looking for TV';
  return (
    <header class="header">
      <span class="brand">Thuisbios</span>
      <button type="button" class="chip" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span class={`dot ${connected ? 'on' : ''}`} />
        <span class="chip-name">{name}</span>
        <Icon name="chevron" size={18} />
      </button>
      {open ? (
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-label="Choose a TV" onClick={(e) => e.stopPropagation()}>
            <h2>Your TV</h2>
            {tv.tvs.length === 0 ? (
              <p class="empty">
                {tv.loaded
                  ? 'Open Thuisbios on your TV and sign in; it will show up here.'
                  : 'Looking for your TV...'}
              </p>
            ) : (
              <ul class="tv-list">
                {tv.tvs.map((s) => (
                  <li key={s.DeviceId}>
                    <button
                      type="button"
                      class={s.DeviceId === tv.tv?.DeviceId ? 'tv-item selected' : 'tv-item'}
                      onClick={() => {
                        tv.chooseTv(s.DeviceId);
                        setOpen(false);
                      }}
                    >
                      <span class="dot on" />
                      <span class="tv-name">{s.DeviceName || 'TV'}</span>
                      <span class="tv-sub">{s.Client}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p class="signed-in">Signed in as {session.userName}</p>
            <button
              type="button"
              class="btn secondary"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <Icon name="signout" size={20} /> Sign out
            </button>
            <button type="button" class="btn ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
