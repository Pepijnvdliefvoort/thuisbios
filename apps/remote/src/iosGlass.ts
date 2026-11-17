/**
 * The iOS "glass" look (translucent, blurred bars and sheets). It is switched on with the `ios-glass` class on
 * <html> and only on iOS, in Safari and in the Home Screen app; every glass rule in styles.css starts with
 * `html.ios-glass`, so Android and desktop keep the plain look.
 */

export interface IosProbe {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * True on an iPhone, iPod or iPad. An iPad in "desktop site" mode (the default on iPadOS 13+) reports a Mac
 * user agent and platform "MacIntel", but unlike a real Mac it has a touch screen.
 */
export function isIOS({ userAgent, platform = '', maxTouchPoints = 0 }: IosProbe): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

const BLUR_SUPPORT = '(-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))';

function supportsBackdropBlur(): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(BLUR_SUPPORT);
  } catch (e) {
    return false;
  }
}

/** Adds `ios-glass` to <html> on iOS when the browser can blur what is behind an element. Returns whether it did. */
export function applyIosGlass(doc: Document = document, nav: Navigator = navigator): boolean {
  if (!isIOS(nav) || !supportsBackdropBlur()) return false;
  doc.documentElement.classList.add('ios-glass');
  return true;
}
