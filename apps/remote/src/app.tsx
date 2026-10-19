import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MiniPlayer } from './components/MiniPlayer';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { TvChip } from './components/TvChip';
import { clientInfo } from './clientInfo';
import { Ctx, type AppContext } from './context';
import { createClient } from './jellyfin/client';
import type { Session } from './jellyfin/types';
import { useNav } from './nav';
import { Details } from './screens/Details';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { NowPlaying } from './screens/NowPlaying';
import { Search } from './screens/Search';
import { SignIn } from './screens/SignIn';
import { clearSession, getDeviceId, loadSession, saveSession } from './storage';
import { useTv } from './useTv';

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  if (!session) {
    return (
      <SignIn
        onSignedIn={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }
  return (
    <Shell
      session={session}
      onSignOut={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

function Shell({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const client = useMemo(
    () => createClient({ serverUrl: session.serverUrl, info: clientInfo(), token: session.token }),
    [session],
  );
  const nav = useNav();
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = (message: string) => {
    setToastText(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(''), 2600);
  };
  const tv = useTv(client, session.userId, getDeviceId(), toast);

  // Keep the tab's scroll position while a screen is open on top of it.
  const savedScroll = useRef(0);
  const open = nav.stack.length > 0;
  useEffect(() => {
    if (!open) window.scrollTo(0, savedScroll.current);
    else window.scrollTo(0, 0);
  }, [open]);
  const remember = () => {
    if (nav.stack.length === 0) savedScroll.current = window.scrollY;
  };

  const ctx: AppContext = {
    client,
    session,
    tv,
    toast,
    openItem: (id) => {
      remember();
      nav.push({ kind: 'details', id });
    },
    openNowPlaying: () => {
      remember();
      nav.push({ kind: 'nowPlaying' });
    },
  };

  const top = nav.stack[nav.stack.length - 1];
  const signOut = () => {
    void client.logout().catch(() => undefined);
    onSignOut();
  };

  return (
    <Ctx.Provider value={ctx}>
      <div class="shell">
        <div hidden={open}>
          <TvChip onSignOut={signOut} />
          <main hidden={nav.tab !== 'home'}>
            <Home />
          </main>
          <main hidden={nav.tab !== 'search'}>
            <Search />
          </main>
          <main hidden={nav.tab !== 'library'}>
            <Library />
          </main>
        </div>
        {top && top.kind === 'details' ? <Details key={`${nav.stack.length}:${top.id}`} id={top.id} onBack={nav.back} /> : null}
        {top && top.kind === 'nowPlaying' ? <NowPlaying onBack={nav.back} /> : null}
        <div class="bottom">
          {top && top.kind === 'nowPlaying' ? null : <MiniPlayer />}
          <TabBar tab={nav.tab} onChange={nav.setTab} />
        </div>
        <Toast message={toastText} />
      </div>
    </Ctx.Provider>
  );
}
