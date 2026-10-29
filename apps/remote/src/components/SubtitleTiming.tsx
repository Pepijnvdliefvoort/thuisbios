import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { formatOffset, stepOffset } from '../subtitleOffset';
import { loadSubtitleOffset, saveSubtitleOffset } from '../storage';
import { useScrollLock } from '../useScrollLock';
import { Icon } from './Icon';

const CLOSE_MS = 200;
const STEPS: { label: string; ms: number }[] = [
  { label: '\u22120.5 s', ms: -500 },
  { label: '\u22120.1 s', ms: -100 },
  { label: '+0.1 s', ms: 100 },
  { label: '+0.5 s', ms: 500 },
];

/** A compact button that opens a bottom sheet to shift the TV's subtitles earlier or later. */
export function SubtitleTiming({ itemId }: { itemId: string }) {
  const { tv } = useApp();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [offset, setOffset] = useState(() => loadSubtitleOffset(itemId));
  // A new item (next episode) starts from its own saved value.
  const [lastItem, setLastItem] = useState(itemId);
  if (lastItem !== itemId) {
    setLastItem(itemId);
    setOffset(loadSubtitleOffset(itemId));
  }
  useScrollLock(open);

  const apply = (next: number) => {
    setOffset(next);
    saveSubtitleOffset(itemId, next);
    tv.setSubtitleOffset(itemId, next);
  };
  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  return (
    <>
      <button type="button" class="btn secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="captions" size={20} /> Sub {offset === 0 ? 'timing' : formatOffset(offset)}
      </button>
      {open
        ? createPortal(
            <div class={closing ? 'sheet-backdrop volume-backdrop out' : 'sheet-backdrop volume-backdrop'} onClick={close}>
              <div class="sheet volume-sheet" role="dialog" aria-label="Subtitle timing" onClick={(e) => e.stopPropagation()}>
                <h2>Subtitle timing</h2>
                <p class="sub-value" aria-live="polite">{formatOffset(offset)}</p>
                <div class="vol-steps sub-steps">
                  {STEPS.map((s) => (
                    <button
                      key={s.ms}
                      type="button"
                      class="vol-step"
                      disabled={stepOffset(offset, s.ms) === offset}
                      onClick={() => apply(stepOffset(offset, s.ms))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button type="button" class="btn secondary" disabled={offset === 0} onClick={() => apply(0)}>
                  Reset
                </button>
                <p class="vol-hint">Subtitles too early? Tap +. Too late? Tap −. Only works for text subtitles.</p>
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
