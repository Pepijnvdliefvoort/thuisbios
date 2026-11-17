// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyIosGlass, isIOS } from './iosGlass';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('isIOS', () => {
  it('is true for an iPhone', () => {
    expect(isIOS({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
  });
  it('is true for iPad Safari', () => {
    expect(isIOS({ userAgent: IPAD, platform: 'iPad', maxTouchPoints: 5 })).toBe(true);
  });
  it('is true for iPadOS posing as a Mac (MacIntel with a touch screen)', () => {
    expect(isIOS({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  });
  it('is false for a Mac', () => {
    expect(isIOS({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });
  it('is false for Android Chrome', () => {
    expect(isIOS({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 })).toBe(false);
  });
});

describe('applyIosGlass', () => {
  const nav = (userAgent: string) => ({ userAgent, platform: '', maxTouchPoints: 0 }) as Navigator;
  const withCss = (supported: boolean, run: () => void) => {
    const prev = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: unknown }).CSS = { supports: () => supported };
    try {
      run();
    } finally {
      (globalThis as { CSS?: unknown }).CSS = prev;
    }
  };

  it('adds the class on iOS with backdrop blur support', () => {
    withCss(true, () => {
      const doc = document.implementation.createHTMLDocument('t');
      expect(applyIosGlass(doc, nav(IPHONE))).toBe(true);
      expect(doc.documentElement.classList.contains('ios-glass')).toBe(true);
    });
  });
  it('does nothing without backdrop blur support', () => {
    withCss(false, () => {
      const doc = document.implementation.createHTMLDocument('t');
      expect(applyIosGlass(doc, nav(IPHONE))).toBe(false);
      expect(doc.documentElement.classList.contains('ios-glass')).toBe(false);
    });
  });
  it('does nothing on Android', () => {
    withCss(true, () => {
      const doc = document.implementation.createHTMLDocument('t');
      expect(applyIosGlass(doc, nav(ANDROID))).toBe(false);
      expect(doc.documentElement.classList.contains('ios-glass')).toBe(false);
    });
  });
});
