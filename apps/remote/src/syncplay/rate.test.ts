import { describe, expect, it } from 'vitest';
import { canChangePlaybackRate } from './rate';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('canChangePlaybackRate', () => {
  it('allows it in Chrome-like and Firefox browsers', () => {
    expect(canChangePlaybackRate({ userAgent: CHROME })).toBe(true);
    expect(canChangePlaybackRate({ userAgent: ANDROID })).toBe(true);
    expect(canChangePlaybackRate({ userAgent: FIREFOX })).toBe(true);
  });
  it('seeks instead on iOS and Safari', () => {
    expect(canChangePlaybackRate({ userAgent: IPHONE })).toBe(false);
    expect(canChangePlaybackRate({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    // An iPad asking for the desktop site.
    expect(canChangePlaybackRate({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
  });
});
