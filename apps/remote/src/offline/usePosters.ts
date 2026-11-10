import { useEffect, useRef, useState } from 'preact/hooks';
import { posterKey } from './downloadKeys';
import type { DownloadStore } from './downloadStore';

/**
 * Object URLs of the saved pictures of some downloads, by item id. Loaded from the download store (no network)
 * and revoked when the item goes away or the screen closes.
 */
export function usePosters(store: DownloadStore | null, ids: string[], version = ''): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const known = useRef<Record<string, string>>({});
  const asked = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  const latest = useRef(ids);
  latest.current = ids;
  const key = `${ids.join('|')}#${version}`;

  useEffect(() => {
    if (!store) return;
    // Forget the pictures of removed items.
    const gone = Object.keys(known.current).filter((id) => ids.indexOf(id) < 0);
    if (gone.length > 0) {
      for (const id of gone) {
        URL.revokeObjectURL(known.current[id]);
        delete known.current[id];
        asked.current.delete(id);
      }
      setUrls({ ...known.current });
    }
    for (const id of ids) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      void store
        .get(posterKey(id))
        .then((res) => (res ? res.blob() : null))
        .then((blob) => {
          if (!blob) {
            asked.current.delete(id); // not saved yet: ask again when the downloads change
            return;
          }
          if (!mounted.current || latest.current.indexOf(id) < 0) return; // closed, or removed meanwhile
          known.current[id] = URL.createObjectURL(blob);
          setUrls({ ...known.current });
        })
        .catch(() => asked.current.delete(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);

  useEffect(
    () => () => {
      mounted.current = false;
      for (const id of Object.keys(known.current)) URL.revokeObjectURL(known.current[id]);
      known.current = {};
      asked.current = new Set();
    },
    [],
  );
  return urls;
}
