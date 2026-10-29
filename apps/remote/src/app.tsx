import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MiniPlayer } from './components/MiniPlayer';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { TvChip } from './components/TvChip';
import { clientInfo } from './clientInfo';
import { Ctx, type AppContext } from './context';
import { createClient } from './jellyfin/client';
import type { Session } from './jellyfin/types';
import { useNav } from './nav';
import { playbackJustEnded, type PlaybackState } from './playbackEnd';
import { ConnectTv } from './screens/ConnectTv';
import { Details } from './screens/Details';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { NowPlaying } from './screens/NowPlaying';
import { Player } from './screens/Player';
import { Requests } from './screens/Requests';
import { Search } from './screens/Search';
import { SignIn } from './screens/SignIn';
import { enterLandscapeFullscreen } from './fullscreen';
import { parseConnectParam } from './jellyfin/quickConnect';
import { clearSession, getDeviceId, loadPendingConnect, loadSession, saveSession, savePendingConnect } from './storage';
import { SCROLLER_ID, scrollOffset, scrollToOffset } from './scroller';
import { useRequests } from './useRequests';
import { isDesktop, useDesktop } from './useDesktop';
import { useScrollerRefresh } from './useScrollerRefresh';
import { useTv } from './useTv';

/**
 * Reads `?connect=CODE` (from the TV's QR code) once at load and removes it from the URL. The code is kept
 * in sessionStorage so a reload while signing in does not lose it.
 */
function takeConnectCode(): string | null {
  try {
    const parsed = parseConnectParam(window.location.search);
    if (parsed.present) {
      history.replaceState(history.state, '', `${window.location.pathname}${parsed.search}${window.location.hash}`);
      if (parsed.code) savePendingConnect(parsed.code);
    }
  } catch (e) {
    // Unreadable URL or no history: nothing to connect.
  }
  return loadPendingConnect();
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  // True when the server rejected the token, so SignIn can say why.
  const [expired, setExpired] = useState(false);
  // A ref, not state: clearing it must not re-render the app while the Connect TV screen opens.
  const pending = useRef<string | null | undefined>(undefined);
  if (pending.current === undefined) pending.current = takeConnectCode();
  if (!session) {
    return (
      <SignIn
        connecting={!!pending.current}
        expired={expired}
        onSignedIn={(s) => {
          saveSession(s);
          setExpired(false);
          setSession(s);
        }}
      />
    );
  }
  return (
    <Shell
      session={session}
      connectCode={pending.current ?? null}
      onConnectTaken={() => {
        savePendingConnect(null);
        pending.current = null;
      }}
      onSignOut={(wasExpired) => {
        clearSession();
        setExpired(!!wasExpired);
        setSession(null);
      }}
    />
  );
}

function Shell({
  session,
  connectCode,
  onConnectTaken,
  onSignOut,
}: {
  session: Session;
  connectCode: string | null;
  onConnectTaken: () => void;
  onSignOut: (expired?: boolean) => void;
}) {
  useScrollerRefresh();
  const desktop = useDesktop();
  // The client is memoized on the session, so it reaches the latest callback through a ref.
  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;
  const client = useMemo(
    () =>
      createClient({
        serverUrl: session.serverUrl,
        info: clientInfo(),
        token: session.token,
        // Token revoked server-side: skip logout() and return to sign-in (may fire for several parallel requests).
        onUnauthorized: () => onSignOutRef.current(true),
      }),
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
  const requests = useRequests(session);

  // Counts playback endings so Home can refresh its Resume watching row.
  const [playbackEnded, setPlaybackEnded] = useState(0);
  const [libraryChanged, setLibraryChanged] = useState(0);
  const playing: PlaybackState = {
    tv: !!tv.nowPlaying,
    phone: nav.stack.length > 0 && nav.stack[nav.stack.length - 1].kind === 'player',
  };
  const prevPlaying = useRef(playing);
  useEffect(() => {
    if (playbackJustEnded(prevPlaying.current, playing)) setPlaybackEnded((n) => n + 1);
    prevPlaying.current = playing;
  }, [playing.tv, playing.phone]);

  // Keep the tab's scroll position while a screen is open on top of it.
  const savedScroll = useRef(0);
  const open = nav.stack.length > 0;
  useEffect(() => {
    scrollToOffset(open ? 0 : savedScroll.current);
  }, [open]);
  const remember = () => {
    if (nav.stack.length === 0) savedScroll.current = scrollOffset();
  };

  // A QR-code link: open the Connect TV screen, which authorizes the code straight away.
  useEffect(() => {
    if (!connectCode) return;
    onConnectTaken();
    nav.push({ kind: 'connect', code: connectCode });
  }, []);

  const ctx: AppContext = {
    client,
    session,
    tv,
    requests,
    playbackEnded,
    libraryChanged,
    refreshLibrary: () => setLibraryChanged((n) => n + 1),
    toast,
    openItem: (id) => {
      remember();
      nav.push({ kind: 'details', id });
    },
    openConnectTv: () => {
      remember();
      nav.push({ kind: 'connect' });
    },
    openNowPlaying: () => {
      remember();
      nav.push({ kind: 'nowPlaying' });
    },
    playHere: (item, startTicks) => {
      // Inside the tap that started playback, so the browser allows fullscreen and the orientation lock.
      // Not on a desktop: the player fills the window and has a fullscreen button.
      if (!isDesktop()) enterLandscapeFullscreen();
      remember();
      nav.push({ kind: 'player', item, startTicks });
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
        {desktop && !(top && top.kind === 'player') ? <TopBar tab={nav.tab} onChange={nav.setTab} badge={requests.badge} onSignOut={signOut} /> : null}
        <div class={top && top.kind === 'nowPlaying' ? 'scroller fixed' : 'scroller'} id={SCROLLER_ID}>
          <div hidden={open}>
            {desktop ? null : <TvChip onSignOut={signOut} />}
            <main hidden={nav.tab !== 'home'}>
              <Home />
            </main>
            <main hidden={nav.tab !== 'search'}>
              <Search />
            </main>
            <main hidden={nav.tab !== 'library'}>
              <Library />
            </main>
            <main hidden={nav.tab !== 'requests'}>
              <Requests active={nav.tab === 'requests'} />
            </main>
          </div>
          {top && top.kind === 'details' ? <Details key={`${nav.stack.length}:${top.id}`} id={top.id} onBack={nav.back} /> : null}
          {top && top.kind === 'connect' ? <ConnectTv key={`${nav.stack.length}:connect`} initialCode={top.code} onBack={nav.back} /> : null}
          {top && top.kind === 'nowPlaying' ? <NowPlaying onBack={nav.back} onClose={() => nav.setTab('home')} /> : null}
          {top && top.kind === 'player' ? (
            <Player
              key={`${nav.stack.length}:player:${top.item.Id}`}
              item={top.item}
              startTicks={top.startTicks}
              onBack={nav.back}
              onNext={(next) => nav.replace({ kind: 'player', item: next, startTicks: 0 })}
            />
          ) : null}
        </div>
        {desktop ? (
          top && (top.kind === 'nowPlaying' || top.kind === 'connect' || top.kind === 'player') ? null : (
            <div class="mini-dock">
              <MiniPlayer />
            </div>
          )
        ) : (
          <div class="bottom">
            {top && (top.kind === 'nowPlaying' || top.kind === 'connect' || top.kind === 'player') ? null : <MiniPlayer />}
            {top && (top.kind === 'connect' || top.kind === 'player') ? null : <TabBar tab={nav.tab} onChange={nav.setTab} badge={requests.badge} />}
          </div>
        )}
        <Toast message={toastText} />
      </div>
    </Ctx.Provider>
  );
}
