import { useEffect, useState } from 'preact/hooks';
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
  onBack(): void;
  onTogglePlay(): void;
  onSkip(seconds: number): void;
  onSeek(seconds: number): void;
  onSelectSubtitle(index: number): void;
  /** Reports whether the user is busy with the bar or the subtitle panel, which keeps the controls up. */
  onBusy(busy: boolean): void;
  /** Any touch on the controls, so the hide timer restarts. */
  onInteract(): void;
  desktop?: DesktopControls;
}

/** Streaming-style overlay: top bar, centre buttons and a bottom bar with the scrub bar and subtitle picker. */
export function PlayerControls(p: Props) {
  const [panel, setPanel] = useState(false);
  // While dragging: the time under the finger. The video only seeks on release.
  const [preview, setPreview] = useState<number | null>(null);
  // Mouse: the fraction of the bar under the pointer, for the time tooltip.
  const [hover, setHover] = useState<number | null>(null);
  const d = p.desktop;

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

  // Esc closes the subtitle menu first (before the player's own Esc handling sees it).
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
  const pick = (index: number) => {
    p.onSelectSubtitle(index);
    setPanel(false);
    p.onBusy(false);
  };

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

      <div class="pc-center">
        <button type="button" class="pc-btn" onClick={() => p.onSkip(-10)} aria-label="Back 10 seconds">
          <Icon name="rewind10" size={40} />
        </button>
        <button type="button" class="pc-btn pc-play" onClick={p.onTogglePlay} aria-label={p.paused ? 'Play' : 'Pause'}>
          <Icon name={p.paused ? 'play' : 'pause'} size={48} />
        </button>
        <button type="button" class="pc-btn" onClick={() => p.onSkip(10)} aria-label="Forward 10 seconds">
          <Icon name="forward10" size={40} />
        </button>
      </div>

      <div class="pc-bottom">
        {panel ? (
          <div class="pc-panel" role="menu" aria-label="Subtitles">
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
        ) : null}
        <div class="pc-row">
          {d ? (
            <button type="button" class="pc-btn pc-small" onClick={p.onTogglePlay} aria-label={p.paused ? 'Play' : 'Pause'}>
              <Icon name={p.paused ? 'play' : 'pause'} size={28} />
            </button>
          ) : null}
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
            onPointerLeave={d ? () => setHover(null) : undefined}
          >
            <div class="pc-track">
              <i class="pc-buffered" style={{ width: pct(p.buffered) }} />
              <i class="pc-played" style={{ width: pct(shown) }} />
            </div>
            <i class="pc-thumb" style={{ left: pct(shown) }} />
            {d && tipAt !== null && total > 0 ? (
              <span class="pc-tip" style={{ left: `${Math.max(0, Math.min(1, tipAt)) * 100}%` }}>
                {formatClock(Math.max(0, Math.min(1, tipAt)) * total)}
              </span>
            ) : null}
          </div>
          <span class="pc-time">{total > 0 ? `-${formatClock(total - shown)}` : ''}</span>
          {d ? (
            <div class="pc-vol">
              <button type="button" class="pc-btn pc-small" onClick={d.onToggleMute} aria-label={d.muted ? 'Unmute' : 'Mute'}>
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
          ) : null}
          <button
            type="button"
            class={'pc-btn pc-cc' + (p.selected >= 0 ? ' on' : '')}
            onClick={togglePanel}
            aria-label="Subtitles"
            aria-expanded={panel}
          >
            <Icon name="captions" />
          </button>
          {d && d.canFullscreen ? (
            <button type="button" class="pc-btn pc-small" onClick={d.onToggleFullscreen} aria-label={d.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <Icon name={d.fullscreen ? 'exitFullscreen' : 'fullscreen'} size={26} />
            </button>
          ) : null}
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
