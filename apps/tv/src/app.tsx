import { useEffect, useMemo, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { createClient } from './jellyfin/client';
import type { MovieItem, Session } from './jellyfin/types';
import { registerRemoteKeys } from './tizen/api';
import { clearSession, loadSession, saveSession } from './storage';
import { ConnectScreen } from './screens/ConnectScreen';
import { MoviesScreen } from './screens/MoviesScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { VolumeScreen } from './screens/VolumeScreen';

type Screen = { name: 'movies' } | { name: 'player'; item: MovieItem } | { name: 'volume' };

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [screen, setScreen] = useState<Screen>({ name: 'movies' });

  useEffect(() => {
    registerRemoteKeys();
  }, []);

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
          onExit={() => setScreen({ name: 'movies' })}
        />
      );
    case 'volume':
      return <VolumeScreen onExit={() => setScreen({ name: 'movies' })} />;
    default:
      return (
        <MoviesScreen
          client={client}
          session={session}
          onPlay={(item) => setScreen({ name: 'player', item })}
          onVolume={() => setScreen({ name: 'volume' })}
          onLogout={logout}
        />
      );
  }
}
