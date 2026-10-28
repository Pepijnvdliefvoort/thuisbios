export interface ViewportInput {
  innerHeight: number;
}

/** The app height in px: the visible height. Never taller than the frame (iOS 26 standalone), or the tab bar hangs off the bottom. */
export function appHeight(v: ViewportInput): number {
  return v.innerHeight;
}

/** Keeps the `--app-h` CSS variable equal to the visible app height. */
export function trackViewportHeight(): void {
  const root = document.documentElement;
  const update = () => root.style.setProperty('--app-h', `${appHeight({ innerHeight: window.innerHeight })}px`);
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
}
