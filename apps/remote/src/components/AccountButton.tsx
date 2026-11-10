import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { initialOf, serverHost } from '../accountMenu';
import { Avatar, ConfirmButton, MenuSheet } from './MenuSheet';

/** Header avatar that opens the Account sheet: who is signed in, on which server, and Sign out. */
export function AccountButton({ onSignOut }: { onSignOut: () => void }) {
  const { session } = useApp();
  const [open, setOpen] = useState(false);
  const letter = initialOf(session.userName);
  return (
    <>
      <button type="button" class="account-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Account">
        {letter}
      </button>
      {open ? (
        <MenuSheet label="Account" onClose={() => setOpen(false)}>
          <div class="sheet-head">
            <Avatar letter={letter} size={56} />
            <div class="sheet-head-text">
              <strong>{session.userName}</strong>
              <span>{serverHost(session.serverUrl)}</span>
            </div>
          </div>
          <div class="sheet-divider" />
          <ConfirmButton
            label="Sign out"
            icon="signout"
            onConfirm={() => {
              setOpen(false);
              onSignOut();
            }}
          />
          <p class="sheet-version">Thuisbios v{__APP_VERSION__}</p>
        </MenuSheet>
      ) : null}
    </>
  );
}
