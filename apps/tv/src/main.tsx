import { render } from 'preact';
import { App } from './app';
import { KeyLog } from './debug/KeyLog';
import { FullscreenGate } from './components/FullscreenGate';
import { requestFullscreenOnce } from './fullscreen';
import { installPointerFocus } from './nav/pointer';
import { installFullscreenGate } from './nav/fullscreenGate';
import { dpadRequested, installPointerDpad, isDpadActive } from './nav/pointerDpad';
import './styles.css';

requestFullscreenOnce();
installPointerFocus();
if (dpadRequested(navigator.userAgent, window.location.search)) installPointerDpad();
installFullscreenGate(() => dpadRequested(navigator.userAgent, window.location.search) || isDpadActive());
render(
  <>
    <App />
    <FullscreenGate />
    <KeyLog />
  </>,
  document.getElementById('app') as HTMLElement,
);
