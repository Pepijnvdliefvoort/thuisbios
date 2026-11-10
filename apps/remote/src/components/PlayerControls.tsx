import { useEffect, useRef, useState } from 'preact/hooks';
import type { AudioTrack } from '../jellyfin/audio';
import { formatClock } from '../jellyfin/format';
import type { SubtitleTrack } from '../jellyfin/subtitles';
import { scrubFraction } from '../scrub';
import { Icon } from './Icon';

/** Extras for a mouse: volume, fullscreen and hover time on the scrub bar. Absent on a phone. */
export interface DesktopControls {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  canFullscreen: boolean;
  onVolume(volume: number): void;
  onToggleMute(): void;
  onToggleFullscreen(): void;
}

/** Previous and next episode buttons; only passed for episodes. A missing neighbour (first or last episode) disables its button. */
export interface EpisodeNav {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious(): void;
  onNext(): void;
}

interface Props {
  eyebrow: string;
  title: string;
  visible: boolean;
  paused: boolean;
  buffering: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  buffered: number;
  /** The stage is turned 90° clockwise (phone held upright), so the scrub bar runs top to bottom on screen. */
  rotated: boolean;
  tracks: SubtitleTrack[];
  /** Index into `tracks`, -1 for Off. */
  selected: number;
  /** Audio streams of the item; the Audio section of the menu only shows with 2 or more. */
  audioTracks: AudioTrack[];
  /** Jellyfin stream index of the audio playing; null when unknown. */
  audioSelected: number | null;
  onBack(): void;
  onTogglePlay(): void;
  onSkip(seconds: number): void;
  onSeek(seconds: number): void;
  onSelectSubtitle(index: number): void;
  onSelectAudio(index: number): void;
  /** Reports whether the user is busy with the bar or the subtitle panel, which keeps the controls up. */
  onBusy(busy: boolean): void;
  /** Any touch on the controls, so the hide timer restarts. */
  onInteract(): void;
  desktop?: DesktopControls;
  episodeNav?: EpisodeNav;
}

/** Streaming-style overlay: top bar, centre buttons and a bottom bar with the scrub bar and the audio and subtitle menu. */
export function PlayerControls(p: Props) {
  const [panel, setPanel] = useState(false);
  // While dragging: the time under the finger. The video only seeks on release.
  const [preview, setPreview] = useState<number | null>(null);
  // Mouse: the fraction of the bar under the pointer, for the time tooltip.
  const [hover, setHover] = useState<number | null>(null);
  // Mouse: a brief play icon in the middle when playback resumes.
  const [pulse, setPulse] = useState(false);
  const wasPaused = useRef(p.paused);
  const d = p.desktop;
  const nav = p.episodeNav;

  useEffect(() => {
    if (!d) return;
    const resumed = wasPaused.current && !p.paused;
    wasPaused.current = p.paused;
    if (!resumed) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 600);
    return () => window.clearTimeout(t);
  }, [p.paused, !!d]);

  const total = p.duration > 0 ? p.duration : 0;
  const shown = preview !== null ? preview : p.position;
  const pct = (seconds: number): string => `${total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0}%`;

  const fractionOf = (e: PointerEvent): number =>
    scrubFraction(e.clientX, e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect(), p.rotated);
  const onDown = (e: PointerEvent) => {
    if (!(total > 0)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPreview(fractionOf(e) * total);
    p.onBusy(true);
  };
  const onMove = (e: PointerEvent) => {
    if (d && e.pointerType === 'mouse') setHover(fractionOf(e));
    if (preview !== null) setPreview(fractionOf(e) * total);
  };
  const onUp = (e: PointerEvent) => {
    if (preview === null) return;
    p.onSeek(fractionOf(e) * total);
    setPreview(null);
    p.onBusy(panel);
  };
  const onCancel = () => {
    setPreview(null);
    p.onBusy(panel);
  };

  // Esc closes the audio and subtitle menu first (before the player's own Esc handling sees it).
  useEffect(() => {
    if (!panel || !d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setPanel(false);
      p.onBusy(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [panel, !!d]);

  const tipAt = preview !== null && total > 0 ? preview / total : hover;

  const togglePanel = () => {
    setPanel(!panel);
    p.onBusy(!panel);
  };
  const closePanel = () => {
    setPanel(false);
    p.onBusy(false);
  };
  const pick = (index: number) => {
    p.onSelectSubtitle(index);
    closePanel();
  };
  const pickAudio = (index: number) => {
    // The current track needs no restart of the stream.
    if (index !== p.audioSelected) p.onSelectAudio(index);
    closePanel();
  };
  const showAudio = p.audioTracks.length >= 2;

  const panelEl = panel ? (
    <div class="pc-panel" role="menu" aria-label={showAudio ? 'Audio and subtitles' : 'Subtitles'}>
      {showAudio ? (
        <>
          <p class="pc-panel-h">Audio</p>
          {p.audioTracks.map((t) => (
            <button key={t.index} type="button" role="menuitemradio" aria-checked={p.audioSelected === t.index} onClick={() => pickAudio(t.index)}>
              <span class="pc-check">{p.audioSelected === t.index ? <Icon name="check" size={20} /> : null}</span>
              {t.label}
            </button>
          ))}
          <p class="pc-panel-h">Subtitles</p>
        </>
      ) : null}
      <button type="button" role="menuitemradio" aria-checked={p.selected < 0} onClick={() => pick(-1)}>
        <span class="pc-check">{p.selected < 0 ? <Icon name="check" size={20} /> : null}</span>Off
      </button>
      {p.tracks.map((t, i) => (
        <button key={t.index} type="button" role="menuitemradio" aria-checked={p.selected === i} onClick={() => pick(i)}>
          <span class="pc-check">{p.selected === i ? <Icon name="check" size={20} /> : null}</span>
          {t.label}
        </button>
      ))}
    </div>
  ) : null;

  if (d) {
    const tipFrac = tipAt === null ? null : Math.max(0, Math.min(1, tipAt));
    return (
      <div
        class={'pc pc-desk' + (p.visible ? ' show' : '') + (p.buffering ? ' buffering' : '') + (p.paused ? ' paused' : '')}
        onPointerDown={p.onInteract}
      >
        {panel ? <div class="pc-backdrop" onClick={togglePanel} /> : null}
        <div class="pc-top">
          <button type="button" class="pc-btn pc-back" onClick={p.onBack} aria-label="Back">
            <Icon name="back" size={26} />
          </button>
          <div class="pc-title">
            {p.eyebrow ? <p class="pc-eyebrow">{p.eyebrow}</p> : null}
            <h1>{p.title}</h1>
          </div>
        </div>

        <div class={'pc-bigplay' + (p.paused ? ' on' : pulse ? ' pulse' : '')} aria-hidden="true">
          <Icon name="play" size={44} />
        </div>

        <div class="pc-bottom">
          <div
            class={'pc-scrub' + (preview !== null ? ' dragging' : '')}
            role="slider"
            aria-label="Position"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(shown)}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            onPointerLeave={() => setHover(null)}
          >
            <div class="pc-track">
              <i class="pc-buffered" style={{ width: pct(p.buffered) }} />
              <i class="pc-played" style={{ width: pct(shown) }} />
            </div>
            <i class="pc-thumb" style={{ left: pct(shown) }} />
            {tipFrac !== null && total > 0 ? (
              <span class="pc-tip" style={{ left: `${tipFrac * 100}%` }}>
                {formatClock(tipFrac * total)}
              </span>
            ) : null}
          </div>
          <div class="pc-row">
            <div class="pc-group">
              <button type="button" class="pc-btn" onClick={p.onTogglePlay} aria-label={p.paused ? 'Play' : 'Pause'}>
                <Icon name={p.paused ? 'play' : 'pause'} size={28} />
              </button>
              <button type="button" class="pc-btn" onClick={() => p.onSkip(-10)} aria-label="Back 10 seconds">
                <Icon name="rewind10" size={26} />
              </button>
              <button type="button" class="pc-btn" onClick={() => p.onSkip(10)} aria-label="Forward 10 seconds">
                <Icon name="forward10" size={26} />
              </button>
              {nav ? (
                <>
                  <button type="button" class="pc-btn" onClick={nav.onPrevious} disabled={!nav.hasPrevious} aria-label="Previous episode">
                    <Icon name="prev" size={26} />
                  </button>
                  <button type="button" class="pc-btn" onClick={nav.onNext} disabled={!nav.hasNext} aria-label="Next episode">
                    <Icon name="next" size={26} />
                  </button>
                </>
              ) : null}
              <div class="pc-vol">
                <button type="button" class="pc-btn" onClick={d.onToggleMute} aria-label={d.muted ? 'Unmute' : 'Mute'}>
                  <Icon name={d.muted || d.volume === 0 ? 'volumeMute' : d.volume < 0.4 ? 'volumeDown' : 'volumeUp'} size={26} />
                </button>
                <input
                  type="range"
                  class="pc-vol-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={d.muted ? 0 : Math.round(d.volume * 100)}
                  style={{ '--fill': `${d.muted ? 0 : Math.round(d.volume * 100)}%` }}
                  aria-label="Volume"
                  onInput={(e) => d.onVolume(Number((e.target as HTMLInputElement).value) / 100)}
                />
              </div>
              <span class="pc-time">
                {formatClock(shown)}
                {total > 0 ? <span class="pc-time-total"> / {formatClock(total)}</span> : null}
              </span>
            </div>
            <div class="pc-group">
              <div class="pc-menu">
                {panelEl}
                <button
                  type="button"
                  class={'pc-btn pc-cc' + (p.selected >= 0 ? ' on' : '')}
                  onClick={togglePanel}
                  aria-label={showAudio ? 'Audio and subtitles' : 'Subtitles'}
                  aria-expanded={panel}
                  aria-haspopup="menu"
                >
                  <Icon name="bubble" size={26} />
                </button>
              </div>
              {d.canFullscreen ? (
                <button type="button" class="pc-btn" onClick={d.onToggleFullscreen} aria-label={d.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  <Icon name={d.fullscreen ? 'exitFullscreen' : 'fullscreen'} size={26} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {p.buffering ? (
          <div class="pc-loading" role="status">
            <span class="pc-spinner" />
            <span>Loading...</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div class={'pc' + (p.visible ? ' show' : '') + (p.buffering ? ' buffering' : '')} onPointerDown={p.onInteract}>
      {panel ? <div class="pc-backdrop" onClick={togglePanel} /> : null}
      <div class="pc-top">
        <button type="button" class="pc-btn" onClick={p.onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="pc-title">
          {p.eyebrow ? <p class="pc-eyebrow">{p.eyebrow}</p> : null}
          <h1>{p.title}</h1>
        </div>
      </div>

      <div class={'pc-center' + (nav ? ' with-nav' : '')}>
        {nav ? (
          <button type="button" class="pc-btn pc-ep" onClick={nav.onPrevious} disabled={!nav.hasPrevious} aria-label="Previous episode">
            <Icon name="prev" size={32} />
          </button>
        ) : null}
        <button type="button" class="pc-btn" onClick={() => p.onSkip(-10)} aria-label="Back 10 seconds">
          <Icon name="rewind10" size={40} />
        </button>
        <button type="button" class="pc-btn pc-play" onClick={p.onTogglePlay} aria-label={p.paused ? 'Play' : 'Pause'}>
          <Icon name={p.paused ? 'play' : 'pause'} size={48} />
        </button>
        <button type="button" class="pc-btn" onClick={() => p.onSkip(10)} aria-label="Forward 10 seconds">
          <Icon name="forward10" size={40} />
        </button>
        {nav ? (
          <button type="button" class="pc-btn pc-ep" onClick={nav.onNext} disabled={!nav.hasNext} aria-label="Next episode">
            <Icon name="next" size={32} />
          </button>
        ) : null}
      </div>

      <div class="pc-bottom">
        {panelEl}
        <div class="pc-row">
          <span class="pc-time">{formatClock(shown)}</span>
          <div
            class={'pc-scrub' + (preview !== null ? ' dragging' : '')}
            role="slider"
            aria-label="Position"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(shown)}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
          >
            <div class="pc-track">
              <i class="pc-buffered" style={{ width: pct(p.buffered) }} />
              <i class="pc-played" style={{ width: pct(shown) }} />
            </div>
            <i class="pc-thumb" style={{ left: pct(shown) }} />
          </div>
          <span class="pc-time">{total > 0 ? `-${formatClock(total - shown)}` : ''}</span>
          <button
            type="button"
            class={'pc-btn pc-cc' + (p.selected >= 0 ? ' on' : '')}
            onClick={togglePanel}
            aria-label={showAudio ? 'Audio and subtitles' : 'Subtitles'}
            aria-expanded={panel}
          >
            <Icon name="captions" />
          </button>
        </div>
      </div>

      {p.buffering ? (
        <div class="pc-loading" role="status">
          <span class="pc-spinner" />
          <span>Loading...</span>
        </div>
      ) : null}
    </div>
  );
}
