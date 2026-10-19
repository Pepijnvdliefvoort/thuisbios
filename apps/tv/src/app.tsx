import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { createClient } from './jellyfin/client';
import type { MovieItem, Session } from './jellyfin/types';
import { createScreenHistory } from './nav/screenHistory';
import { registerRemoteKeys } from './tizen/api';
import { clearSession, loadSession, saveSession } from './storage';
import { ConnectScreen } from './screens/ConnectScreen';
import { MoviesScreen } from './screens/MoviesScreen';
import { PlayerScreen } from './screens/PlayerScreen';

type Screen = { name: 'movies' } | { name: 'player'; item: MovieItem };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [screen, setScreen] = useState<Screen>({ name: 'movies' });

  const nav = useRef(createScreenHistory(window));

  useEffect(() => {
    registerRemoteKeys();
    // Browser back / RETURN: go back to the list instead of leaving the app.
    return nav.current.onPop(() => setScreen({ name: 'movies' }));
  }, []);

  const open = (next: Screen) => {
    nav.current.enter();
    setScreen(next);
  };
  const exit = () => nav.current.back(() => setScreen({ name: 'movies' }));

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
          setScreen({ name: 'movies' });
          setSession(s);
        }}
      />
    );
  }

  const logout = () => {
    clearSession();
    setSession(null);
  };

  switch (screen.name) {
    case 'player':
      return (
        <PlayerScreen
          client={client}
          session={session}
          item={screen.item}
          onExit={exit}
        />
      );
    default:
      return (
        <MoviesScreen
          client={client}
          session={session}
          onPlay={(item) => open({ name: 'player', item })}
          onLogout={logout}
        />
      );
  }
}
