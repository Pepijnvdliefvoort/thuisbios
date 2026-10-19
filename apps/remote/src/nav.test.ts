import { describe, expect, it } from 'vitest';
import { depthOf } from './nav';

describe('depthOf', () => {
  it('reads the stack depth from a history state', () => {
    expect(depthOf({ thuisbios: 2 })).toBe(2);
    expect(depthOf(null)).toBe(0);
    expect(depthOf({})).toBe(0);
    expect(depthOf({ thuisbios: -1 })).toBe(0);
  });
});
