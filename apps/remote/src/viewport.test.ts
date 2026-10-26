import { describe, expect, it } from 'vitest';
import { appHeight } from './viewport';

const base = { innerWidth: 430, innerHeight: 870, screenWidth: 430, screenHeight: 932, iosStandalone: false };

describe('appHeight', () => {
  it('uses innerHeight outside iOS standalone', () => {
    expect(appHeight(base)).toBe(870);
  });
  it('uses the screen height in iOS standalone portrait', () => {
    expect(appHeight({ ...base, iosStandalone: true })).toBe(932);
  });
  it('uses the short screen side in landscape', () => {
    expect(appHeight({ ...base, innerWidth: 900, innerHeight: 380, iosStandalone: true })).toBe(430);
  });
  it('never goes below innerHeight', () => {
    expect(appHeight({ ...base, innerHeight: 950, iosStandalone: true })).toBe(950);
  });
});
