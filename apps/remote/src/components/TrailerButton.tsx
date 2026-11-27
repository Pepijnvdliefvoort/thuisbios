import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../context';
import { asTrailerItem, trailerSource, youtubeEmbedUrl } from '../jellyfin/trailers';
import type { BaseItem } from '../jellyfin/types';
import { useScrollLock } from '../useScrollLock';
import { ActionTile } from './ActionTile';
import { Icon } from './Icon';

/**
 * "Trailer" on a movie or series page. A trailer stored in the library plays in the app's own player; a YouTube
 * link plays in a sheet on top of the page; any other link opens in a new tab. Nothing starts until it is tapped,
 * and it is left out offline.
 */
export function TrailerButton({ item, variant = 'button' }: { item: BaseItem; variant?: 'button' | 'tile' }) {
  const { client, session, offline, toast, playHere } = useApp();
  const [busy, setBusy] = useState(false);
  const [youtube, setYoutube] = useState<string | null>(null);
  const source = trailerSource(item);
  if (offline || !source) return null;

  const open = async () => {
    if (source.kind === 'youtube') {
      setYoutube(source.id);
    } else if (source.kind === 'link') {
      window.open(source.url, '_blank', 'noopener,noreferrer');
    } else {
      setBusy(true);
      try {
        const first = (await client.localTrailers(session.userId, item.Id))[0];
        if (first) playHere(asTrailerItem(first), 0);
        else toast('No trailer found');
      } catch {
        toast("Couldn't load the trailer");
      }
      setBusy(false);
    }
  };

  return (
    <>
      {variant === 'tile' ? (
        <ActionTile label="Trailer" disabled={busy} onClick={() => void open()}>
          <Icon name="trailer" size={24} />
        </ActionTile>
      ) : (
        <button type="button" class="btn secondary" disabled={busy} onClick={() => void open()}>
          <Icon name="trailer" size={20} /> Trailer
        </button>
      )}
      {youtube ? <TrailerSheet id={youtube} title={item.Name} onClose={() => setYoutube(null)} /> : null}
    </>
  );
}

/** The embedded YouTube player. Closing removes the iframe, which stops the video. */
function TrailerSheet({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="trailer-backdrop" onClick={onClose}>
      <div class="trailer-sheet" role="dialog" aria-label={`${title} trailer`} onClick={(e) => e.stopPropagation()}>
        <div class="trailer-head">
          <strong>{title}</strong>
          <button type="button" class="trailer-close" onClick={onClose} aria-label="Close trailer">
            <Icon name="close" size={22} />
          </button>
        </div>
        <div class="trailer-frame">
          <iframe
            src={youtubeEmbedUrl(id)}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>
  );
}
