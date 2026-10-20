import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OWN_REQUEST_MS, SWALLOW_MS, createGateGuard, disableGate, gateActive, isGateActive, resetGate, subscribeGate, updateGate } from './fullscreenGate';

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

describe('gate guard', () => {
  const make = (extra: Partial<Parameters<typeof createGateGuard>[0]> = {}) => {
    const t = { now: 1000 };
    const onDisable = vi.fn();
    const log = vi.fn();
    const guard = createGateGuard({ now: () => t.now, onDisable, log, ...extra });
    return { t, onDisable, log, guard };
  };

  it('ignores errors when the gate made no request', () => {
    const { guard, onDisable, log } = make();
    expect(guard.refused('fullscreenerror')).toBe(false);
    expect(onDisable).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('fullscreenerror ignored (not ours)');
  });

  it('ignores errors that arrive long after our request', () => {
    const { guard, t, onDisable } = make();
    guard.requested();
    t.now += OWN_REQUEST_MS + 1;
    expect(guard.refused('fullscreenerror')).toBe(false);
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('disables only after two failed attempts in a row', () => {
    const { guard, t, onDisable } = make();
    guard.requested();
    t.now += 100;
    expect(guard.refused('fullscreenerror')).toBe(false);
    t.now += 1000;
    guard.requested();
    t.now += 100;
    expect(guard.refused('rejection')).toBe(true);
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('counts an error event plus a rejection for one request once', () => {
    const { guard, onDisable } = make();
    guard.requested();
    guard.refused('fullscreenerror');
    guard.refused('rejection');
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('resets the failure count when full screen is entered', () => {
    const { guard, onDisable } = make();
    guard.requested();
    guard.refused('fullscreenerror');
    guard.entered();
    guard.requested();
    guard.refused('fullscreenerror');
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('swallows for 1000 ms after an OK was swallowed', () => {
    const { guard, t } = make();
    expect(guard.inWindow()).toBe(false);
    guard.swallowed();
    t.now += SWALLOW_MS - 1;
    expect(guard.inWindow()).toBe(true);
    t.now += 1;
    expect(guard.inWindow()).toBe(false);
  });
});
