import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import type { Session } from './jellyfin/types';
import type { TvApi } from './useTv';

export interface AppContext {
  client: JellyfinClient;
  session: Session;
  tv: TvApi;
  openItem(id: string): void;
  openNowPlaying(): void;
  toast(message: string): void;
}

export const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp outside provider');
  return value;
}
