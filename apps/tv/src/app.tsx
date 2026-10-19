import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { setLastBack } from './debug/keyLogState';
import { requestFullscreen } from './fullscreen';
import { createClient } from './jellyfin/client';
import { ticksToSeconds } from './jellyfin/playback';
import type { BaseItem, Session } from './jellyfin/types';
import { createReturnKey, installReturnKey } from './nav/returnKey';
import { createScreenHistory } from './nav/screenHistory';
import { subscribeRemote } from './remote/bus';
import { startRemoteSocket } from './remote/socket';
import { registerRemoteKeys } from './tizen/api';
import { clearSession, loadSession, saveSession } from './storage';
import { ConnectScreen } from './screens/ConnectScreen';
import { DetailsScreen, type DetailsMemo } from './screens/DetailsScreen';
import { ScreensaverScreen } from './screens/ScreensaverScreen';
import { PlayerScreen } from './screens/PlayerScreen';

/** The screen stack: the screensaver at the bottom, then details (Show on TV), the player. */
type Screen =
  | { name: 'screensaver' }
  | { name: 'details'; item: BaseItem; memo: DetailsMemo }
  | { name: 'player'; item: BaseItem; startSeconds: number; nonce: number };

/** Bumped for every player screen so playing the same item again remounts the player. */
let playerNonce = 0;
const playerScreen = (item: BaseItem, startSeconds: number): Extract<Screen, { name: 'player' }> => ({
  name: 'player',
  item,
  startSeconds,
  nonce: ++playerNonce,
});

const HOME: Screen = { name: 'screensaver' };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [stack, setStack] = useState<Screen[]>([HOME]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

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

  /** Replaces the top screen (same history entry) when it is already `name`, else opens a new one. */
  const showOnTop = (next: Screen) => {
    if (stackRef.current[stackRef.current.length - 1].name === next.name) {
      setStack((s) => s.slice(0, -1).concat([next]));
    } else open(next);
  };
  const showOnTopRef = useRef(showOnTop);
  showOnTopRef.current = showOnTop;

  /** Phone "Disconnect": back to the base screen first (an open player unmounts and reports stopped), then sign out. */
  const signOut = () => {
    setStack([HOME]);
    if (!client) return;
    // Server logout is best effort and must not block the local sign-out; wait for it at most 500 ms
    // so the player's stop report (sent on unmount, still needs the token) can go out first.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearSession();
      setSession(null);
    };
    setTimeout(finish, 500);
    client.logout().then(finish, finish);
  };
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  // Phone remote: hold the Jellyfin socket open while signed in and act on Play / DisplayContent.
  // Playstate commands are handled by the player itself.
  useEffect(() => {
    if (!session || !client) return;
    const stopSocket = startRemoteSocket(client, session, clientInfo().deviceId);
    const off = subscribeRemote((command) => {
      if (command.type === 'play') {
        client
          .item(session.userId, command.itemId)
          .then((item) => showOnTopRef.current(playerScreen(item, ticksToSeconds(command.startPositionTicks))))
          .catch(() => undefined);
      } else if (command.type === 'disconnect') {
        signOutRef.current();
      } else if (command.type === 'display') {
        client
          .item(session.userId, command.itemId)
          .then((item) => showOnTopRef.current({ name: 'details', item, memo: {} }))
          .catch(() => undefined);
      }
    });
    return () => {
      off();
      stopSocket();
    };
  }, [client, session]);

  if (!session || !client) {
    return (
      <ConnectScreen
        onConnected={(s) => {
          saveSession(s);
          setStack([HOME]);
          setSession(s);
        }}
      />
    );
  }

  const logout = () => {
    clearSession();
    setStack([HOME]);
    setSession(null);
  };
  const play = (item: BaseItem, startSeconds: number) => open(playerScreen(item, startSeconds));

  const screen = stack[stack.length - 1];
  switch (screen.name) {
    case 'player':
      return (
        <PlayerScreen
          key={screen.item.Id + ':' + screen.nonce}
          client={client}
          session={session}
          item={screen.item}
          startSeconds={screen.startSeconds}
          onExit={exit}
          onReplace={(item) => showOnTop(playerScreen(item, 0))}
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
      return <ScreensaverScreen client={client} session={session} onSignOut={logout} />;
  }
}
