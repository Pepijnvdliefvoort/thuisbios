import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../context';
import { defaultAudioIndex, listAudio } from '../jellyfin/audio';
import { listSubtitles } from '../jellyfin/subtitles';
import { trackSummary } from '../jellyfin/trackSummary';
import type { MediaStream } from '../jellyfin/types';
import { useScrollLock } from '../useScrollLock';
import { Icon } from './Icon';

const CLOSE_MS = 200;

/**
 * A button that opens a bottom sheet to choose the audio and subtitle track the TV plays.
 * `tile` is the Now Playing tile, with the current languages on a second line.
 */
export function TrackPicker({ itemId, variant = 'button' }: { itemId: string; variant?: 'button' | 'tile' }) {
  const { tv, client, session } = useApp();
  const np = tv.nowPlaying;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // null while loading; empty when the server lists no streams.
  const [streams, setStreams] = useState<MediaStream[] | null>(null);
  useScrollLock(open);

  // The streams of the playing item, fetched once per item (a new episode refetches) for the tile summary.
  const load = () => {
    let alive = true;
    client
      .mediaStreams(session.userId, itemId)
      .then((list) => alive && setStreams(list))
      .catch(() => alive && setStreams([]));
    return () => {
      alive = false;
    };
  };
  useEffect(() => {
    setStreams(null);
    return load();
  }, [client, session.userId, itemId]);
  // A failed fetch is tried again when the sheet opens.
  useEffect(() => {
    if (!open || !streams || streams.length > 0) return;
    setStreams(null);
    return load();
  }, [open]);

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  const source = { Id: itemId, MediaStreams: streams || [] };
  const audio = listAudio(source);
  // The TV only shows text subtitles; burned-in image tracks are a phone-player thing.
  const subs = listSubtitles(source).filter((t) => !t.burnIn);
  const audioNow = np && np.audioIndex !== undefined ? np.audioIndex : defaultAudioIndex(audio);
  const subNow = np && np.subtitleIndex !== undefined ? np.subtitleIndex : -1;

  const row = (key: string, label: string, selected: boolean, onPick: () => void) => (
    <li key={key}>
      <button type="button" class={'tv-item' + (selected ? ' selected' : '')} role="radio" aria-checked={selected} onClick={onPick}>
        <span class="tv-name">{label}</span>
        {selected ? <Icon name="check" size={20} /> : null}
      </button>
    </li>
  );

  return (
    <>
      {variant === 'tile' ? (
        <button type="button" class="np-tile" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="bubble" size={24} />
          <span class="np-tile-label">Audio &amp; subs</span>
          <span class="np-tile-sub">{trackSummary(streams, np ? np.audioIndex : undefined, np ? np.subtitleIndex : undefined)}</span>
        </button>
      ) : (
        <button type="button" class="btn secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="captions" size={20} /> Audio &amp; subs
        </button>
      )}
      {open
        ? createPortal(
            <div class={closing ? 'sheet-backdrop volume-backdrop out' : 'sheet-backdrop volume-backdrop'} onClick={close}>
              <div class="sheet volume-sheet track-sheet" role="dialog" aria-label="Audio and subtitles" onClick={(e) => e.stopPropagation()}>
                <h2>Audio &amp; subtitles</h2>
                {streams === null ? (
                  <p class="vol-hint" role="status">Loading...</p>
                ) : audio.length === 0 && subs.length === 0 ? (
                  <p class="vol-hint">No tracks to choose from.</p>
                ) : (
                  <>
                    {audio.length > 0 ? (
                      <>
                        <h3 class="track-h">Audio</h3>
                        <ul class="tv-list" role="radiogroup" aria-label="Audio">
                          {audio.map((t) => row(`a${t.index}`, t.label, audioNow === t.index, () => tv.setAudioTrack(t.index)))}
                        </ul>
                      </>
                    ) : null}
                    {subs.length > 0 ? (
                      <>
                        <h3 class="track-h">Subtitles</h3>
                        <ul class="tv-list" role="radiogroup" aria-label="Subtitles">
                          {row('s-off', 'Off', subNow < 0, () => tv.setSubtitleTrack(-1))}
                          {subs.map((t) => row(`s${t.index}`, t.label, subNow === t.index, () => tv.setSubtitleTrack(t.index)))}
                        </ul>
                      </>
                    ) : null}
                    <p class="vol-hint">Changing the audio restarts the picture for a moment. Only text subtitles can be shown.</p>
                  </>
                )}
                <button type="button" class="btn ghost" onClick={close}>
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
