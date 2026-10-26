export interface ViewportInput {
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  /** iOS home-screen app (no browser chrome). */
  iosStandalone: boolean;
}

/** The app height in px. iOS standalone often reports an innerHeight (and 100vh/100dvh) that is too short; the screen height is the real frame. */
export function appHeight(v: ViewportInput): number {
  if (!v.iosStandalone) return v.innerHeight;
  const short = Math.min(v.screenWidth, v.screenHeight);
  const long = Math.max(v.screenWidth, v.screenHeight);
  return Math.max(v.innerHeight, v.innerWidth > v.innerHeight ? short : long);
}

function isIosStandalone(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  return (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** Keeps the `--app-h` CSS variable equal to the usable app height. */
export function trackViewportHeight(): void {
  const root = document.documentElement;
  const standalone = isIosStandalone();
  const update = () => {
    const h = appHeight({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: screen.width,
      screenHeight: screen.height,
      iosStandalone: standalone,
    });
    root.style.setProperty('--app-h', `${h}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update);
}
