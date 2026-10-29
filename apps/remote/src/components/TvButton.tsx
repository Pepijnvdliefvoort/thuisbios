import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { tvStatusLine } from '../accountMenu';
import { Icon } from './Icon';
import { Avatar, ConfirmButton, MenuSheet } from './MenuSheet';
import { VolumeControls } from './VolumeControls';

/**
 * Header button for the TV. Without a TV it goes straight to the Connect TV screen; with one it shows the
 * TV's name and opens the TV sheet.
 */
export function TvButton() {
  const { tv, openConnectTv, toast } = useApp();
  const [open, setOpen] = useState(false);
  if (!tv.loaded) {
    return (
      <span class="tv-btn looking">
        <Icon name="tv" size={18} />
        <span class="tv-btn-name">Looking for TV…</span>
      </span>
    );
  }
  if (!tv.tv) {
    return (
      <button type="button" class="tv-btn is-connect" onClick={openConnectTv}>
        <Icon name="tv" size={18} />
        <span class="tv-btn-name">Connect TV</span>
      </button>
    );
  }
  const name = tv.tv.DeviceName || 'TV';
  const close = () => setOpen(false);
  const connectAnother = () => {
    close();
    openConnectTv();
  };
  return (
    <>
      <button type="button" class="tv-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`TV: ${name}`}>
        <Icon name="tv" size={18} />
        <span class="dot on" />
        <span class="tv-btn-name">{name}</span>
      </button>
      {open ? (
        <MenuSheet label="TV" onClose={close}>
          <div class="sheet-head">
            <Avatar icon="tv" size={56} />
            <div class="sheet-head-text">
              <strong>{name}</strong>
              <span>{tvStatusLine(tv.nowPlaying)}</span>
            </div>
          </div>
          {tv.tvs.length > 1 ? (
            <>
              <p class="sheet-label">Switch TV</p>
              <ul class="tv-list">
                {tv.tvs.map((s) => (
                  <li key={s.DeviceId}>
                    <button
                      type="button"
                      class={s.DeviceId === tv.tv?.DeviceId ? 'tv-item selected' : 'tv-item'}
                      onClick={() => {
                        tv.chooseTv(s.DeviceId);
                        close();
                      }}
                    >
                      <span class="dot on" />
                      <span class="tv-name">{s.DeviceName || 'TV'}</span>
                      <span class="tv-sub">{s.Client}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <VolumeControls variant="row" />
          <button type="button" class="btn secondary" onClick={connectAnother}>
            <Icon name="tv" size={20} /> Connect another TV
          </button>
          <div class="sheet-divider" />
          <p class="sheet-note">The TV signs out and shows a new code to connect again.</p>
          <ConfirmButton
            label="Disconnect TV"
            icon="tv"
            onConfirm={() => {
              tv.disconnect();
              close();
              toast('Disconnected, the TV is signed out');
            }}
          />
        </MenuSheet>
      ) : null}
    </>
  );
}
