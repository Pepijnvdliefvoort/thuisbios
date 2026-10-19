import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { setLastBack } from './debug/keyLogState';
import { requestFullscreen } from './fullscreen';
import { createClient } from './jellyfin/client';
import type { BaseItem, Session } from './jellyfin/types';
import { createReturnKey, installReturnKey } from './nav/returnKey';
import { createScreenHistory } from './nav/screenHistory';
import { registerRemoteKeys } from './tizen/api';
import { clearSession, loadSession, saveSession } from './storage';
import { ConnectScreen } from './screens/ConnectScreen';
import { DetailsScreen, type DetailsMemo } from './screens/DetailsScreen';
import { HomeScreen, type HomeSnapshot } from './screens/HomeScreen';
import { PlayerScreen } from './screens/PlayerScreen';

/** The screen stack: home at the bottom, then details, then the player. */
type Screen =
  | { name: 'home' }
  | { name: 'details'; item: BaseItem; memo: DetailsMemo }
  | { name: 'player'; item: BaseItem; startSeconds: number };

const HOME: Screen = { name: 'home' };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [stack, setStack] = useState<Screen[]>([HOME]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const homeSnapshot = useRef<HomeSnapshot | null>(null);

  const nav = useRef(createScreenHistory(window));

  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const popRef = useRef(pop);
  popRef.current = pop;
  /** One step back: through the browser history so RETURN and on-screen Back stay in step. */
  const exit = () => nav.current.back(() => popRef.current());
  const exitRef = useRef(exit);
  exitRef.current = exit;

  useEffect(() => {
    registerRemoteKeys();
    const core = createReturnKey({
      depth: () => stackRef.current.length - 1,
      back: () => exitRef.current(),
      reenter: () => requestFullscreen(),
      log: setLastBack,
    });
    const offFullscreen = installReturnKey(core);
    // Browser back / RETURN: go back one screen instead of leaving the app. A popstate that
    // duplicates a fullscreen-exit back step is ignored.
    const offPop = nav.current.onPop(() => {
      if (core.onPop()) popRef.current();
    });
    return () => {
      offFullscreen();
      offPop();
    };
  }, []);

  const open = (next: Screen) => {
    nav.current.enter();
    setStack((s) => s.concat([next]));
  };

  const client = useMemo(
    () =>
      session ? createClient({ serverUrl: session.serverUrl, info: clientInfo(), token: session.token }) : null,
    [session],
  );

  if (!session || !client) {
    return (
      <ConnectScreen
        onConnected={(s) => {
          saveSession(s);
          homeSnapshot.current = null;
          setStack([HOME]);
          setSession(s);
        }}
      />
    );
  }

  const logout = () => {
    clearSession();
    homeSnapshot.current = null;
    setSession(null);
  };
  const openDetails = (item: BaseItem) => open({ name: 'details', item, memo: {} });
  const play = (item: BaseItem, startSeconds: number) => open({ name: 'player', item, startSeconds });

  const screen = stack[stack.length - 1];
  switch (screen.name) {
    case 'player':
      return (
        <PlayerScreen
          client={client}
          session={session}
          item={screen.item}
          startSeconds={screen.startSeconds}
          onExit={exit}
        />
      );
    case 'details':
      return (
        <DetailsScreen
          key={screen.item.Id}
          client={client}
          session={session}
          item={screen.item}
          memo={screen.memo}
          onPlay={play}
          onBack={exit}
        />
      );
    default:
      return (
        <HomeScreen
          client={client}
          session={session}
          snapshot={homeSnapshot.current}
          onSnapshot={(s) => {
            homeSnapshot.current = s;
          }}
          onOpen={openDetails}
          onPlay={play}
          onLogout={logout}
        />
      );
  }
}
