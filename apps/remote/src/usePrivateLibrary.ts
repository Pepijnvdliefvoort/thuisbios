import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import { withPrivacyFilter } from './jellyfin/privacy';
import { emptyPrivateSet, hasPrivateLibrary, isPrivateItem, loadPrivateSet, type PrivateSet } from './jellyfin/privateLibrary';
import type { Session } from './jellyfin/types';
import { loadPrivateIds, loadShowPrivate, savePrivateIds, saveShowPrivate } from './storage';

/** How long the first screens wait for the private library before they show what they have (a slow or missing network). */
const WAIT_MS = 4000;

/** What the screens see of the private library. */
export interface PrivacyApi {
  /** True when the user has a private library (the account menu offers the switch only then). */
  hasPrivate: boolean;
  /** The private library's name, as the server shows it. */
  privateName: string;
  showPrivate: boolean;
  setShowPrivate(show: boolean): void;
  /** True while this item is hidden (it, or its series, is in the private library and the switch is off). */
  isHidden(item: { Id: string; SeriesId?: string }): boolean;
}

/**
 * The private library of the signed-in user: the ids saved at the last start apply at once, the server's answer replaces them.
 * `client` is `base` with the private items left out while the switch is off; it changes when the switch flips, so screens reload.
 * `ready` is false while nothing is known yet (first start), so Home does not show private items for a moment.
 */
export function usePrivateLibrary(base: JellyfinClient, session: Session): { client: JellyfinClient; privacy: PrivacyApi; ready: boolean } {
  const saved = useMemo(() => loadPrivateIds(), []);
  const [set, setSet] = useState<PrivateSet>(saved || emptyPrivateSet());
  const [ready, setReady] = useState(!!saved);
  const [showPrivate, setShow] = useState(loadShowPrivate);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => alive && setReady(true), WAIT_MS);
    loadPrivateSet(base, session.userId).then(
      (fresh) => {
        if (!alive) return;
        savePrivateIds(fresh);
        setSet(fresh);
        setReady(true);
      },
      // Offline or an error: keep the saved ids.
      () => alive && setReady(true),
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [base, session.userId]);
  const client = useMemo(() => (showPrivate ? base : withPrivacyFilter(base, set)), [base, set, showPrivate]);
  const privacy = useMemo<PrivacyApi>(
    () => ({
      hasPrivate: hasPrivateLibrary(set),
      privateName: set.name,
      showPrivate,
      setShowPrivate: (show) => {
        saveShowPrivate(show);
        setShow(show);
      },
      isHidden: (item) => !showPrivate && isPrivateItem(set, item),
    }),
    [set, showPrivate],
  );
  return { client, privacy, ready };
}
