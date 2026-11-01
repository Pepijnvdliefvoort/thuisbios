import { describe, expect, it } from 'vitest';
import { CX, CY, GROUPS, halfPath, halfPoint, highlightPath, LAYERS, makeParticles, makeTunnel, OPENING, PINKS, TUNNEL, VIEW_H, VIEW_W } from './introScene';

describe('emblem geometry', () => {
  it('runs the edge from the top apex to the bottom on the centre line', () => {
    for (const l of LAYERS) {
      expect(halfPoint(0, l.hw, l.hh)).toEqual([0, -l.hh]);
      expect(halfPoint(1, l.hw, l.hh)).toEqual([0, l.hh]);
    }
  });

  it('keeps every layer inside the box and nested, outer to inner', () => {
    for (let i = 0; i < LAYERS.length; i++) {
      const l = LAYERS[i];
      expect(l.hw + l.dx).toBeLessThan(CX);
      expect(l.hh).toBeLessThan(CY);
      if (i > 0) {
        expect(l.hw).toBeLessThan(LAYERS[i - 1].hw);
        expect(l.hh).toBeLessThan(LAYERS[i - 1].hh);
      }
    }
    expect(OPENING.hw).toBeLessThan(LAYERS[LAYERS.length - 1].hw);
  });

  it('builds closed half paths and an open highlight', () => {
    expect(halfPath(40, 76)).toMatch(/^M0 -76C.*Z$/);
    expect(halfPath(40, 76)).toBe(halfPath(40, 76));
    expect(highlightPath(40, 76).startsWith('M')).toBe(true);
    expect(highlightPath(40, 76)).not.toContain('Z');
  });
});

describe('makeParticles', () => {
  it('is deterministic and has the requested count', () => {
    expect(makeParticles()).toEqual(makeParticles());
    expect(makeParticles(10)).toHaveLength(10);
    expect(makeParticles(10, 1)).not.toEqual(makeParticles(10, 2));
  });

  it('sends every speck to a point inside the emblem, from further out', () => {
    for (const p of makeParticles(200)) {
      expect(p.ex).toBeGreaterThanOrEqual(0);
      expect(p.ex).toBeLessThanOrEqual(VIEW_W / 2);
      expect(p.ey).toBeGreaterThanOrEqual(0);
      expect(p.ey).toBeLessThanOrEqual(VIEW_H / 2);
      expect(Math.hypot(p.sx - 50, (p.sy - 60) / 0.8)).toBeGreaterThanOrEqual(69);
      expect(p.size).toBeGreaterThanOrEqual(2);
      expect(p.size).toBeLessThanOrEqual(6);
      expect(p.delay).toBeLessThanOrEqual(600);
      expect(PINKS).toContain(p.c);
    }
  });
});

describe('makeTunnel', () => {
  it('is deterministic and has the requested counts', () => {
    expect(makeTunnel()).toEqual(makeTunnel());
    const t = makeTunnel(5, 6);
    expect([t.streaks.length, t.dust.length]).toEqual([5, 6]);
    expect(t.rings).toHaveLength(GROUPS.reduce((n, g) => n + g.count, 0));
  });

  it('staggers the rings of each group evenly from its start', () => {
    const t = makeTunnel();
    GROUPS.forEach((g, i) => {
      const delays = t.rings.filter((r) => r.group === i).map((r) => r.delay);
      expect(delays).toHaveLength(g.count);
      expect(delays[0]).toBe(g.start);
      expect(Math.max(...delays)).toBeLessThan(g.start + g.dur);
    });
  });

  it('lets nearer groups follow the path less, and keeps ranges sane', () => {
    expect(GROUPS[0].k).toBeGreaterThan(GROUPS[1].k);
    expect(GROUPS[1].k).toBeGreaterThan(GROUPS[2].k);
    for (const g of GROUPS) expect(g.s0).toBeLessThan(g.s1);
    for (const r of makeTunnel().rings) expect(TUNNEL).toContain(r.c);
  });

  it('keeps every streak and speck in range', () => {
    const t = makeTunnel(200, 200);
    for (const s of [...t.streaks, ...t.dust]) {
      expect(s.group).toBeGreaterThanOrEqual(0);
      expect(s.group).toBeLessThanOrEqual(2);
      expect(s.angle).toBeGreaterThanOrEqual(0);
      expect(s.angle).toBeLessThanOrEqual(360);
      expect(s.r0).toBeLessThan(s.r1);
      expect(s.dur).toBeGreaterThanOrEqual(400);
      expect(s.dur).toBeLessThanOrEqual(1400);
      expect(s.delay).toBeGreaterThanOrEqual(s.fast ? 6000 : 1000);
      expect(s.delay).toBeLessThanOrEqual((s.fast ? 6000 : 1000) + 700);
      expect(TUNNEL).toContain(s.c);
    }
    expect(t.streaks.some((s) => s.fast)).toBe(true);
    for (const s of t.streaks) expect(s.len).toBeGreaterThanOrEqual(2.5);
    for (const s of t.dust) expect(s.len).toBe(1);
  });
});
