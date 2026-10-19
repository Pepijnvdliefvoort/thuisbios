import { describe, expect, it } from 'vitest';
import { mapKey } from './keys';

describe('mapKey', () => {
  it('maps Samsung remote codes', () => {
    expect(mapKey({ keyCode: 10009 })).toBe('back');
    expect(mapKey({ keyCode: 10252 })).toBe('playPause');
    expect(mapKey({ keyCode: 403 })).toBe('red');
    expect(mapKey({ keyCode: 13 })).toBe('enter');
    expect(mapKey({ keyCode: 39 })).toBe('right');
  });

  it('supports desktop shortcuts but not while typing', () => {
    expect(mapKey({ keyCode: 8 })).toBe('back');
    expect(mapKey({ keyCode: 32 })).toBe('playPause');
    expect(mapKey({ keyCode: 8 }, true)).toBeNull();
    expect(mapKey({ keyCode: 82 }, true)).toBeNull();
  });

  it('ignores unknown keys', () => {
    expect(mapKey({ keyCode: 65 })).toBeNull();
  });
});
