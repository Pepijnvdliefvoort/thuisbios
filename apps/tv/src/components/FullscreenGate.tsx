import { useEffect, useState } from 'preact/hooks';
import { isGateActive, subscribeGate } from '../nav/fullscreenGate';

/** Modal over the whole page asking for full screen. Not focusable; fades with opacity only. */
export function FullscreenGate() {
  const [show, setShow] = useState(isGateActive);
  useEffect(() => {
    setShow(isGateActive());
    return subscribeGate(setShow);
  }, []);
  return (
    <div class={'fs-gate' + (show ? ' fs-gate-on' : '')} aria-hidden="true">
      <div class="fs-gate-card">
        <svg class="fs-gate-icon" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        </svg>
        <div class="fs-gate-title">Full screen paused</div>
        <div class="fs-gate-text">
          Press <span class="fs-gate-key">OK</span> to continue in full screen
        </div>
      </div>
    </div>
  );
}
