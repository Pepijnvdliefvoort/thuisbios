import { describe, expect, it } from 'vitest';
import { bestMeasurement, collectSamples, createTimeSync, measure } from './timeSync';

// Server clock is 500 ms ahead; 40 ms each way, 2 ms processing.
const sample = (t0: number, up = 40, down = 40, ahead = 500) => ({
  requestSent: t0,
  requestReceived: t0 + up + ahead,
  responseSent: t0 + up + ahead + 2,
  responseReceived: t0 + up + 2 + down,
});

describe('measure', () => {
  it('computes offset and delay', () => {
    const m = measure(sample(1000));
    expect(m.offsetMs).toBe(500);
    expect(m.delayMs).toBe(80);
  });
  it('is off by half the asymmetry', () => {
    expect(measure(sample(0, 80, 0)).offsetMs).toBe(540);
  });
});

describe('createTimeSync', () => {
  it('is neutral without measurements', () => {
    const t = createTimeSync(() => 5000);
    expect(t.hasMeasurement()).toBe(false);
    expect(t.offsetMs()).toBe(0);
    expect(t.serverNow()).toBe(5000);
  });
  it('uses the lowest delay sample', () => {
    const t = createTimeSync(() => 10_000);
    t.add(sample(0, 100, 100, 480));
    t.add(sample(0, 20, 20, 500));
    t.add(sample(0, 200, 50, 400));
    expect(t.offsetMs()).toBe(500);
    expect(t.pingMs()).toBe(20);
    expect(t.serverNow()).toBe(10_500);
    expect(t.localToServer(1000)).toBe(1500);
    expect(t.serverToLocal(1500)).toBe(1000);
  });
  it('forgets old samples', () => {
    const t = createTimeSync(Date.now, 2);
    t.add(sample(0, 5, 5, 100));
    t.add(sample(0, 50, 50, 200));
    t.add(sample(0, 60, 60, 300));
    expect(t.offsetMs()).toBe(200);
  });
  it('ignores impossible samples', () => {
    const t = createTimeSync();
    t.add({ requestSent: 100, requestReceived: 0, responseSent: 500, responseReceived: 50 });
    expect(t.hasMeasurement()).toBe(false);
    t.add(sample(0));
    t.reset();
    expect(t.hasMeasurement()).toBe(false);
  });
});

describe('bestMeasurement', () => {
  it('handles empty', () => expect(bestMeasurement([])).toBeNull());
});

describe('collectSamples', () => {
  it('skips failures', async () => {
    const t = createTimeSync();
    let n = 0;
    const ok = await collectSamples(
      t,
      async () => {
        if (n++ === 1) throw new Error('x');
        return sample(0);
      },
      3,
      async () => undefined,
    );
    expect(ok).toBe(2);
    expect(t.hasMeasurement()).toBe(true);
  });
});
