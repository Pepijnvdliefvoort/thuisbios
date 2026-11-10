/** Sends queued watch progress to Jellyfin when the device is online. Never throws and never blocks the screens. */
import { dropSent, mergeProgress, type PendingProgress } from './progressQueue';

/** What the sync needs from the Jellyfin client. */
export interface SyncClient {
  markPlayed(userId: string, itemId: string): Promise<void>;
  saveProgress(userId: string, itemId: string, positionTicks: number): Promise<void>;
}

export interface SyncDeps {
  client: SyncClient;
  userId: string;
  load: () => PendingProgress[];
  save: (queue: PendingProgress[]) => void;
  isOnline?: () => boolean;
}

/** An error from the server (not from the network) that will not go away by asking again, like an item that was deleted. */
const isFinalError = (e: unknown): boolean => {
  const status = e && typeof e === 'object' ? (e as { status?: unknown }).status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
};

export interface ProgressSync {
  /** Adds (or updates) the latest position of an item. */
  enqueue(entry: Omit<PendingProgress, 'userId'>): void;
  /** Sends everything queued for this user, oldest first; stops at the first network failure. */
  flush(): Promise<void>;
}

export function createProgressSync(deps: SyncDeps): ProgressSync {
  const online = deps.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  let flushing: Promise<void> | null = null;
  let again = false;

  const run = async (): Promise<void> => {
    for (;;) {
      const next = deps
        .load()
        .filter((e) => e.userId === deps.userId)
        .sort((a, b) => a.at - b.at)[0];
      if (!next || !online()) return;
      try {
        if (next.played) await deps.client.markPlayed(next.userId, next.itemId);
        else await deps.client.saveProgress(next.userId, next.itemId, next.positionTicks);
      } catch (e) {
        if (!isFinalError(e)) return;
      }
      deps.save(dropSent(deps.load(), next));
    }
  };

  return {
    enqueue(entry) {
      try {
        deps.save(mergeProgress(deps.load(), { ...entry, userId: deps.userId }));
      } catch (e) {
        // Storage full or blocked: the position is lost, playback goes on.
      }
    },
    flush() {
      // A flush asked while one runs makes it look again once, so a position added meanwhile is not left behind.
      if (flushing) {
        again = true;
        return flushing;
      }
      flushing = (async () => {
        try {
          do {
            again = false;
            await run();
          } while (again);
        } catch (e) {
          // Never reaches the UI.
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },
  };
}
