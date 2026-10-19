import { useEffect, useState } from 'preact/hooks';
import { fullscreenSupported, isFullscreen, shouldShowFullscreenHint } from '../fullscreen';
import { dpadRequested, isDpadActive } from '../nav/pointerDpad';
import { isTizen } from '../tizen/api';

const compute = (): boolean =>
  shouldShowFullscreenHint({
    dpad: dpadRequested(navigator.userAgent, window.location.search) || isDpadActive(),
    tizen: isTizen(),
    supported: fullscreenSupported(),
    fullscreen: isFullscreen(),
  });

/** Pill telling the viewer that OK enters full screen. Not focusable, fades with opacity only. */
export function FullscreenHint() {
  const [show, setShow] = useState(compute);
  useEffect(() => {
    const update = (): void => setShow(compute());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    update();
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);
  return (
    <div class={'fs-hint' + (show ? ' fs-hint-on' : '')} aria-hidden="true">
      <span class="fs-hint-key">OK</span> Press OK for full screen
    </div>
  );
}
