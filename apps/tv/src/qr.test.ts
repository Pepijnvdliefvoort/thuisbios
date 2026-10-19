import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath, qrSize } from './qr';

describe('qr', () => {
  const url = 'http://192.168.1.50:4174/?connect=123456';
  const m = qrMatrix(url);

  it('builds a square matrix with the finder patterns', () => {
    expect(m.length).toBeGreaterThanOrEqual(21);
    for (const row of m) expect(row.length).toBe(m.length);
    expect(m[0][0]).toBe(true);
    expect(m[0][m.length - 1]).toBe(true);
    expect(m[m.length - 1][0]).toBe(true);
  });
  it('is deterministic', () => {
    expect(qrMatrix(url)).toEqual(m);
  });
  it('makes a path and a size that include the quiet zone', () => {
    expect(qrSize(m, 4)).toBe(m.length + 8);
    expect(qrPath(m, 4).indexOf('M4 4h')).toBe(0);
  });
});
