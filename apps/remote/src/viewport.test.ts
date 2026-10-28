import { describe, expect, it } from 'vitest';
import { appHeight } from './viewport';

describe('appHeight', () => {
  it('returns the visible height in portrait', () => {
    expect(appHeight({ innerHeight: 812 })).toBe(812);
  });
  it('returns the visible height in landscape', () => {
    expect(appHeight({ innerHeight: 380 })).toBe(380);
  });
});
