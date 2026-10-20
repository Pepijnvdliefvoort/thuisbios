import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import { useApp } from '../context';
import { buildAuthHeader } from '../jellyfin/auth';
import { createLevelSender, createTvVolume, describeVolumeError, stepLevel, type VolumeStateResult } from '../tvVolume';
import { Icon, type IconName } from './Icon';

// The relay's status is checked once per sign-in and shared by every VolumeControls on screen.
const checks = new Map<string, Promise<boolean>>();

const CLOSE_MS = 200;
const DISMISS_DRAG_PX = 80;

const iconFor = (level: number, muted: boolean): IconName => (muted ? 'volumeMute' : level < 35 ? 'volumeDown' : 'volumeUp');

/**
 * One volume button for the TV that opens a bottom sheet with a slider and a mute toggle, through the
 * relay on the PC. Renders nothing when there is no relay or the TV is not set up.
 * `row` is the wide variant for inside the TV sheet.
 */
export function VolumeControls({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const { session, toast } = useApp();
  const volume = useMemo(
    () => createTvVolume({ baseUrl: location.href, authHeader: buildAuthHeader(clientInfo(), session.token) }),
    [session.token],
  );
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let check = checks.get(session.token);
    if (!check) {
      check = volume.isConfigured();
      checks.set(session.token, check);
    }
    void check.then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [volume, session.token]);

  if (!available) return null;
  return (
    <>
      {variant === 'row' ? (
        <button type="button" class="btn secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="volumeUp" size={20} /> TV volume
        </button>
      ) : (
        <div class="volume">
          <button type="button" class="tbtn" aria-label="TV volume" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <Icon name="volumeUp" size={30} />
          </button>
        </div>
      )}
      {open ? <VolumeSheet volume={volume} toast={toast} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function VolumeSheet({ volume, toast, onClose }: { volume: ReturnType<typeof createTvVolume>; toast: (m: string) => void; onClose: () => void }) {
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<'absolute' | 'relative'>('absolute');
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const dragStart = useRef(0);
  const sliderActive = useRef(false);
  // The latest level, so quick taps on - and + build on each other instead of on a stale render.
  const levelRef = useRef(0);
  const applyLevel = (next: number) => {
    levelRef.current = next;
    setLevel(next);
  };

  const fail = (r: VolumeStateResult) => {
    if (!r.ok) toast(describeVolumeError(r.error));
    return r.ok;
  };
  const sender = useMemo(
    () =>
      createLevelSender(async (l) => {
        const r = await volume.setVolume(l);
        if (fail(r) && r.ok) {
          setMode(r.state.mode);
          if (r.state.muted !== null) setMuted(r.state.muted);
        }
      }),
    [volume],
  );

  const close = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    let cancelled = false;
    void volume.getVolume().then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        fail(r);
        onClose();
        return;
      }
      applyLevel(r.state.level);
      setMuted(r.state.muted ?? false);
      setMode(r.state.mode);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [volume]);

  const toggleMute = () => {
    void volume.toggleMute().then((r) => {
      if (!fail(r) || !r.ok) return;
      setMode(r.state.mode);
      // Relative mode cannot read the mute state, so the tap is the best guess.
      setMuted(r.state.muted ?? !muted);
      if (!sliderActive.current && r.state.mode === 'absolute') applyLevel(r.state.level);
    });
    if (mode === 'relative') setMuted(!muted);
  };

  const step = (delta: number) => {
    const next = stepLevel(levelRef.current, delta);
    if (next === levelRef.current) return;
    applyLevel(next);
    if (mode === 'relative') setMuted(false);
    sender.update(next);
  };

  const onGrabDown = (e: PointerEvent) => {
    dragging.current = true;
    dragStart.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onGrabMove = (e: PointerEvent) => {
    if (dragging.current) setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onGrabUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > DISMISS_DRAG_PX) close();
    else setDragY(0);
  };

  // In a portal so no parent (such as the TV sheet in the header) can cover or clip the sheet.
  return createPortal(
    <div class={closing ? 'sheet-backdrop volume-backdrop out' : 'sheet-backdrop volume-backdrop'} onClick={close}>
      <div
        class="sheet volume-sheet"
        role="dialog"
        aria-label="TV volume"
        style={dragY ? { transform: `translateY(${dragY}px)`, animation: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="vol-grab" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
          <span class="vol-grabber" />
        </div>
        <h2>TV volume</h2>
        <div class="vol-row">
          <button type="button" class="tbtn" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} disabled={!ready} onClick={toggleMute}>
            <Icon name={iconFor(level, muted)} size={28} />
          </button>
          <input
            class="vol-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={level}
            disabled={!ready}
            aria-label="Volume"
            style={{ '--fill': `${level}%` }}
            onPointerDown={() => (sliderActive.current = true)}
            onInput={(e) => {
              const next = Number((e.currentTarget as HTMLInputElement).value);
              applyLevel(next);
              if (mode === 'relative') setMuted(false);
              sender.update(next);
            }}
            onChange={(e) => {
              sliderActive.current = false;
              sender.flush(Number((e.currentTarget as HTMLInputElement).value));
            }}
          />
          <span class="vol-value" aria-live="off">
            {ready ? level : '--'}
          </span>
        </div>
        <div class="vol-steps">
          <button type="button" class="vol-step" aria-label="Volume down" disabled={!ready || level <= 0} onClick={() => step(-1)}>
            <Icon name="minus" size={28} />
          </button>
          <button type="button" class="vol-step" aria-label="Volume up" disabled={!ready || level >= 100} onClick={() => step(1)}>
            <Icon name="plus" size={28} />
          </button>
        </div>
        <p class="vol-hint">{ready && mode === 'relative' ? 'Approximate level' : ' '}</p>
        <button type="button" class="btn ghost" onClick={close}>
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
