import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import type { BaseItem, Session } from './jellyfin/types';
import type { TvApi } from './useTv';

export interface AppContext {
  client: JellyfinClient;
  session: Session;
  tv: TvApi;
  openItem(id: string): void;
  openNowPlaying(): void;
  /** Plays an item on the phone itself (used when no TV is connected). */
  playOnPhone(item: BaseItem, startTicks: number): void;
  /** Opens the Connect TV screen (enter the Quick Connect code shown on the TV). */
  openConnectTv(): void;
  toast(message: string): void;
}

export const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp outside provider');
  return value;
}
