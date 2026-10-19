import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableGate, gateActive, isGateActive, resetGate, subscribeGate, updateGate } from './fullscreenGate';

const base = { dpad: true, tizen: false, supported: true, fullscreen: false };

describe('gateActive', () => {
  it('is active in the TV browser outside full screen', () => {
    expect(gateActive({ ...base, disabled: false })).toBe(true);
  });
  it('is off in full screen, as Tizen app, without D-pad, without API or when disabled', () => {
    expect(gateActive({ ...base, fullscreen: true, disabled: false })).toBe(false);
    expect(gateActive({ ...base, tizen: true, disabled: false })).toBe(false);
    expect(gateActive({ ...base, dpad: false, disabled: false })).toBe(false);
    expect(gateActive({ ...base, supported: false, disabled: false })).toBe(false);
    expect(gateActive({ ...base, disabled: true })).toBe(false);
  });
});

describe('gate store', () => {
  beforeEach(resetGate);

  it('notifies subscribers only on change', () => {
    const l = vi.fn();
    subscribeGate(l);
    updateGate(base);
    updateGate(base);
    expect(l).toHaveBeenCalledTimes(1);
    expect(isGateActive()).toBe(true);
    updateGate({ ...base, fullscreen: true });
    expect(isGateActive()).toBe(false);
    expect(l).toHaveBeenCalledTimes(2);
  });

  it('stays off for the rest of the session after an error', () => {
    updateGate(base);
    disableGate('test');
    expect(isGateActive()).toBe(false);
    updateGate(base);
    expect(isGateActive()).toBe(false);
  });
});
