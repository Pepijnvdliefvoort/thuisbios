const MAX_SEEN = 200;

const key = (userId: string): string => `thuisbios.requestsSeen.${userId}`;

/** Request ids this user already dismissed or opened from the "now in the library" notice, oldest first. */
export function loadSeenRequests(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(userId)) || 'null');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(-MAX_SEEN) : [];
  } catch (e) {
    return [];
  }
}

/** Remembers a request id (kept to the newest 200) and returns the stored list. */
export function markRequestSeen(userId: string, requestId: string): string[] {
  const ids = loadSeenRequests(userId).filter((id) => id !== requestId);
  ids.push(requestId);
  const kept = ids.slice(-MAX_SEEN);
  try {
    localStorage.setItem(key(userId), JSON.stringify(kept));
  } catch (e) {
    // Storage unavailable (private mode): the notice may show again next time.
  }
  return kept;
}
