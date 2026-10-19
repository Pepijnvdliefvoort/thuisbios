import { useEffect, useState } from 'preact/hooks';
import { debugRequested, initialState, onLastBack, onLastGate, onLastRemote, onLastSeek, onCapabilitiesState, onSocketState, reduce, type KeyLogState } from './keyLogState';

const EVENTS = ['keydown', 'keyup', 'mousemove', 'click'];

/**
 * Key diagnostics overlay. Shows the last key events the page received, to find out which remote
 * buttons reach the app. Enabled by `?debug` in the URL, toggled with the yellow key (C).
 * Listens in the capture phase and never calls preventDefault.
 */
export function KeyLog() {
  const [state, setState] = useState<KeyLogState>(() => initialState(debugRequested(window.location)));

  useEffect(() => {
    const listener = (event: Event) => {
      const isKey = event.type === 'keydown' || event.type === 'keyup';
      // Capture runs before the app's handlers; wait a tick so defaultPrevented is final.
      if (isKey) setTimeout(() => setState((s) => reduce(s, event)), 0);
      else setState((s) => reduce(s, event));
    };
    EVENTS.forEach((t) => window.addEventListener(t, listener, true));
    return () => EVENTS.forEach((t) => window.removeEventListener(t, listener, true));
  }, []);

  useEffect(() => onLastSeek((text) => setState((s) => ({ ...s, seek: text }))), []);

  useEffect(() => onLastBack((text) => setState((s) => ({ ...s, back: text }))), []);

  useEffect(() => onLastGate((text) => setState((s) => ({ ...s, gate: text }))), []);

  useEffect(() => onLastRemote((text) => setState((s) => ({ ...s, remote: text }))), []);

  useEffect(() => onCapabilitiesState((text) => setState((s) => ({ ...s, capabilities: text }))), []);
  useEffect(() => onSocketState((text) => setState((s) => ({ ...s, socket: text }))), []);

  if (!state.enabled) return null;
  return (
    <div class="keylog">
      <div class="keylog-head">KEYS (yellow/C hides)</div>
      {state.entries.length === 0 && <div>press a button...</div>}
      {state.entries.map((e, i) => (
        <div key={i}>
          {e.type === 'keydown' ? 'v' : '^'} {e.keyCode} key={e.key || '-'} code={e.code || '-'} map=
          {e.mapped || 'none'}
          {e.prevented ? ' PREVENTED' : ''}
        </div>
      ))}
      <div class="keylog-head">
        mouse moves: {state.moves}, clicks: {state.clicks}
      </div>
      <div>{state.seek || 'input: -'}</div>
      <div>{state.gate ? `gate: ${state.gate}` : 'gate: -'}</div>
      <div>{state.back ? `back: ${state.back}` : 'back: -'}</div>
      <div>{`remote: ${state.socket || '-'} | ${state.remote || '-'} | capabilities: ${state.capabilities || '-'}`}</div>
    </div>
  );
}
