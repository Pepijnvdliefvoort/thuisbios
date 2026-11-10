import type { BaseItem } from '../jellyfin/types';
import { loadLocalProgress } from '../storage';
import type { DownloadEntry } from './downloadIndex';
import { chooseStartTicks } from './localProgress';
import { preferLocal } from './localPlayback';

/**
 * Where playing `item` on this device should start. `serverTicks` is the resume point the server gave. When the item
 * is downloaded the position saved on this device competes with it and the newest wins; otherwise it is the server's.
 */
export function resolveStart(entries: DownloadEntry[], item: BaseItem, serverTicks: number): number {
  if (!preferLocal(entries, item.Id)) return serverTicks;
  return chooseStartTicks(loadLocalProgress(item.Id), {
    ticks: serverTicks,
    lastPlayed: item.UserData ? item.UserData.LastPlayedDate : undefined,
  });
}
