import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReturnKey, DEDUPE_MS, installReturnKey } from './returnKey';

function setup(initialDepth = 1) {
  let t = 10000;
  let depth = initialDepth;
  const back = vi.fn();
  const reenter = vi.fn();
  const log = vi.fn();
  const core = createReturnKey({ depth: () => depth, back, reenter, log, now: () => t });
  return {
    core,
    back,
    reenter,
    log,
    advance: (ms: number) => {
      t += ms;
    },
    setDepth: (d: number) => {
      depth = d;
    },
  };
}

/** Enter then leave full screen, like Return in the TV browser. */
const exitFullscreen = (core: ReturnType<typeof createReturnKey>) => {
  core.onFullscreenChange(true);
  core.onFullscreenChange(false);
};

describe('fullscreen exit as Return', () => {
  it('goes back once and asks for full screen again on a sub screen', () => {
    const s = setup();
    exitFullscreen(s.core);
    expect(s.back).toHaveBeenCalledTimes(1);
    expect(s.reenter).toHaveBeenCalledTimes(1);
  });

  it('does nothing on the home screen', () => {
    const s = setup(0);
    exitFullscreen(s.core);
    expect(s.back).not.toHaveBeenCalled();
    expect(s.reenter).not.toHaveBeenCalled();
  });

  it('ignores entering full screen and repeated "not fullscreen" events', () => {
    const s = setup();
    s.core.onFullscreenChange(true);
    s.core.onFullscreenChange(false);
    s.core.onFullscreenChange(false);
    expect(s.back).toHaveBeenCalledTimes(1);
  });

  it('needs to have been in full screen first', () => {
    const s = setup();
    s.core.onFullscreenChange(false);
    expect(s.back).not.toHaveBeenCalled();
  });

  it('is skipped while the app itself navigates', () => {
    const s = setup();
    s.core.ignoreExitsFor(500);
    exitFullscreen(s.core);
    expect(s.back).not.toHaveBeenCalled();
    s.advance(501);
    exitFullscreen(s.core);
    expect(s.back).toHaveBeenCalledTimes(1);
  });

  it('swallows an error from the re-enter attempt', () => {
    const s = setup();
    s.reenter.mockImplementation(() => {
      throw new Error('refused');
    });
    expect(() => exitFullscreen(s.core)).not.toThrow();
  });

  it('takes a second Return after the window as a new back step', () => {
    const s = setup(2);
    exitFullscreen(s.core);
    s.advance(DEDUPE_MS + 1);
    exitFullscreen(s.core);
    expect(s.back).toHaveBeenCalledTimes(2);
  });
});

describe('dedupe between fullscreen exit and popstate', () => {
  it('handles the popstate our own back() causes', () => {
    const s = setup();
    exitFullscreen(s.core);
    s.advance(20);
    expect(s.core.onPop()).toBe(true);
  });

  it('ignores a second popstate right after the fullscreen exit was handled', () => {
    const s = setup();
    exitFullscreen(s.core);
    s.advance(20);
    expect(s.core.onPop()).toBe(true); // ours
    s.advance(20);
    expect(s.core.onPop()).toBe(false); // the browser's own
  });

  it('ignores the fullscreen exit when a popstate already went back', () => {
    const s = setup();
    s.core.onFullscreenChange(true);
    expect(s.core.onPop()).toBe(true);
    s.advance(30);
    s.core.onFullscreenChange(false);
    expect(s.back).not.toHaveBeenCalled();
  });

  it('a plain popstate (Return without full screen) is handled', () => {
    const s = setup();
    expect(s.core.onPop()).toBe(true);
  });

  it('two Return presses apart are both handled', () => {
    const s = setup();
    expect(s.core.onPop()).toBe(true);
    s.advance(DEDUPE_MS + 1);
    expect(s.core.onPop()).toBe(true);
  });

  it('a stale own-pop marker does not swallow a later popstate', () => {
    const s = setup();
    exitFullscreen(s.core); // back() called but no popstate ever came
    s.advance(DEDUPE_MS + 1);
    expect(s.core.onPop()).toBe(true);
  });

  it('logs the decisions', () => {
    const s = setup();
    exitFullscreen(s.core);
    expect(s.log).toHaveBeenCalledWith(expect.stringContaining('back'));
  });
});

describe('installReturnKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeDoc() {
    const listeners: { [type: string]: Array<() => void> } = {};
    const doc = {
      fullscreenElement: null as Element | null,
      addEventListener: (type: string, l: () => void) => {
        (listeners[type] = listeners[type] || []).push(l);
      },
      removeEventListener: (type: string, l: () => void) => {
        listeners[type] = (listeners[type] || []).filter((x) => x !== l);
      },
    };
    const fire = (type: string) => (listeners[type] || []).forEach((l) => l());
    return { doc, fire, listeners };
  }

  it('feeds fullscreenchange events to the core and can be removed', () => {
    vi.stubGlobal('window', {});
    const core = { onFullscreenChange: vi.fn(), onPop: vi.fn(), ignoreExitsFor: vi.fn() };
    const { doc, fire, listeners } = fakeDoc();
    const off = installReturnKey(core, doc);
    doc.fullscreenElement = {} as Element;
    fire('fullscreenchange');
    doc.fullscreenElement = null;
    fire('webkitfullscreenchange');
    expect(core.onFullscreenChange.mock.calls).toEqual([[true], [false]]);
    off();
    expect(listeners.fullscreenchange).toEqual([]);
  });

  it('does nothing in the installed Tizen app', () => {
    vi.stubGlobal('window', { tizen: {} });
    const core = { onFullscreenChange: vi.fn(), onPop: vi.fn(), ignoreExitsFor: vi.fn() };
    const { doc, fire } = fakeDoc();
    installReturnKey(core, doc);
    fire('fullscreenchange');
    expect(core.onFullscreenChange).not.toHaveBeenCalled();
  });
});
