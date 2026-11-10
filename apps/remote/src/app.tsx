import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MiniPlayer } from './components/MiniPlayer';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { HeaderActions } from './components/HeaderActions';
import { clientInfo } from './clientInfo';
import { Ctx, type AppContext } from './context';
import { createClient } from './jellyfin/client';
import { resumeTicks } from './jellyfin/playTarget';
import type { BaseItem, Session } from './jellyfin/types';
import { useNav, type Screen } from './nav';
import { playbackJustEnded, type PlaybackState } from './playbackEnd';
import { ConnectTv } from './screens/ConnectTv';
import { Details } from './screens/Details';
import { Downloads } from './screens/Downloads';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { NowPlaying } from './screens/NowPlaying';
import { Player } from './screens/Player';
import { Requests } from './screens/Requests';
import { Search } from './screens/Search';
import { SignIn } from './screens/SignIn';
import { enterLandscapeFullscreen } from './fullscreen';
import { parseConnectParam } from './jellyfin/quickConnect';
import { clearSession, getDeviceId, loadAudioLang, loadPendingConnect, loadProgressQueue, loadSession, saveProgressQueue, saveSession, savePendingConnect } from './storage';
import { SCROLLER_ID, scrollOffset, scrollToOffset } from './scroller';
import { DownloadEngine } from './offline/downloadEngine';
import { itemJsonKey } from './offline/downloadKeys';
import { preferLocal } from './offline/localPlayback';
import { createProgressSync } from './offline/progressSync';
import { resolveStart } from './offline/startPosition';
import { readSavedJson } from './offline/useLocalAssets';
import { createCacheStore, downloadsSupported } from './offline/downloadStore';
import { useDownloadsApi } from './offline/useDownloads';
import { createWakeLock } from './offline/wakeLock';
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

/** The first version had a test page that kept its own copy of a video in this cache; it is gone now. */
const RETIRED_CACHE = 'thuisbios-offline-test';

/** How long Downloads waits for the server's resume point before it plays from what this device knows. */
const FRESH_ITEM_MS = 2000;

const OFFLINE_TOAST = "You're offline. Your downloads are in Account → Downloads.";

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

  // The download queue lives as long as the app, so progress keeps going while the user browses.
  const engine = useMemo(() => {
    if (!downloadsSupported()) return null;
    const probe = document.createElement('video');
    return new DownloadEngine({
      client,
      session,
      deviceId: getDeviceId(),
      store: createCacheStore(),
      canPlay: (mime) => probe.canPlayType(mime) !== '',
      audioLang: loadAudioLang,
      wakeLock: createWakeLock(),
      requestPersist: () => {
        const storage = navigator.storage as StorageManager | undefined;
        if (storage && storage.persist) void storage.persist().catch(() => undefined);
      },
    });
  }, [client, session]);
  useEffect(() => {
    if (!engine) return;
    void engine.start().catch(() => undefined);
    return () => engine.stop();
  }, [engine]);
  const downloads = useDownloadsApi(engine);

  // Watch progress made while offline goes to Jellyfin now, when the app opens and whenever the network is back.
  const progress = useMemo(
    () => createProgressSync({ client, userId: session.userId, load: loadProgressQueue, save: saveProgressQueue }),
    [client, session.userId],
  );
  useEffect(() => {
    const flush = () => void progress.flush();
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [progress]);
  useEffect(() => {
    // Once: delete the cache of the retired offline test page.
    try {
      if (typeof caches !== 'undefined') void caches.delete(RETIRED_CACHE).catch(() => undefined);
    } catch (e) {
      // No Cache API here: nothing to delete.
    }
  }, []);

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

  // Offline: start on the Downloads screen (a QR-code link takes precedence), and tell the user
  // once per offline transition where the downloads are.
  useEffect(() => {
    if (!connectCode && typeof navigator !== 'undefined' && navigator.onLine === false) {
      remember();
      nav.push({ kind: 'downloads' });
    }
    const onOffline = () => toast(OFFLINE_TOAST);
    window.addEventListener('offline', onOffline);
    return () => window.removeEventListener('offline', onOffline);
  }, []);

  const ctx: AppContext = {
    client,
    session,
    tv,
    requests,
    downloads,
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
    openDownloads: () => {
      remember();
      nav.push({ kind: 'downloads' });
    },
    openNowPlaying: () => {
      remember();
      nav.push({ kind: 'nowPlaying' });
    },
    progress,
    playHere: (item, startTicks) => {
      // Inside the tap that started playback, so the browser allows fullscreen and the orientation lock.
      // Not on a desktop: the player fills the window and has a fullscreen button.
      if (!isDesktop()) enterLandscapeFullscreen();
      remember();
      nav.push(playScreen(item, startTicks));
    },
    playDownload: async (id) => {
      if (!isDesktop()) enterLandscapeFullscreen();
      const entry = downloads.get(id);
      if (!entry) return;
      const store = createCacheStore();
      // The item as saved with the download; the list's own facts when that file is missing.
      let item = await readSavedJson<BaseItem>(store, itemJsonKey(id)).catch(() => null);
      if (!item) item = { Id: id, Name: entry.name, Type: entry.type, SeriesId: entry.seriesId, SeriesName: entry.seriesName, ParentIndexNumber: entry.seasonNumber, IndexNumber: entry.episodeNumber };
      // Online, the server may know a newer position (watched on the TV meanwhile).
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const fresh = await Promise.race([
          client.item(session.userId, id).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_ITEM_MS)),
        ]);
        if (fresh && fresh.UserData) item = { ...item, UserData: fresh.UserData };
      }
      remember();
      nav.push(playScreen(item, resolveStart(downloads.entries, item, resumeTicks(item))));
    },
  };

  // A finished download plays from the device (it saves data); anything else asks Jellyfin. `startTicks` is final here.
  const playScreen = (item: BaseItem, startTicks: number): Screen => ({
    kind: 'player',
    item,
    startTicks,
    ...(preferLocal(downloads.entries, item.Id) ? { local: true } : {}),
  });

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
            {desktop ? null : (
              <header class="header">
                <span class="brand">Thuisbios</span>
                <HeaderActions onSignOut={signOut} />
              </header>
            )}
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
          {top && top.kind === 'downloads' ? <Downloads key={`${nav.stack.length}:downloads`} onBack={nav.back} /> : null}
          {top && top.kind === 'nowPlaying' ? <NowPlaying onBack={nav.back} onClose={() => nav.setTab('home')} /> : null}
          {top && top.kind === 'player' ? (
            <Player
              key={`${nav.stack.length}:player:${top.item.Id}`}
              item={top.item}
              startTicks={top.startTicks}
              local={top.local}
              onBack={nav.back}
              onPlayEpisode={(episode) => nav.replace(playScreen(episode, 0))}
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
