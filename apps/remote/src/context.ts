import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import type { BaseItem, Session } from './jellyfin/types';
import type { RequestsState } from './useRequests';
import type { TvApi } from './useTv';

export interface AppContext {
  client: JellyfinClient;
  session: Session;
  tv: TvApi;
  /** Title requests ("Request a movie or show") and the admin's open count. */
  requests: RequestsState;
  /** Increments each time playback ends (TV stopped or phone Player closed), so screens can refresh. */
  playbackEnded: number;
  /** Increments when the user marks something watched or unwatched, so Home can refresh its rows. */
  libraryChanged: number;
  /** Tells Home that watched state changed. */
  refreshLibrary(): void;
  openItem(id: string): void;
  openNowPlaying(): void;
  /** Plays an item in the app's own player on this device (the phone, or the desktop browser). */
  playHere(item: BaseItem, startTicks: number): void;
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
