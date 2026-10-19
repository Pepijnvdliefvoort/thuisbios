import { render } from 'preact';
import { App } from './app';
import { KeyLog } from './debug/KeyLog';
import { requestFullscreenOnce } from './fullscreen';
import { installPointerFocus } from './nav/pointer';
import { dpadRequested, installPointerDpad } from './nav/pointerDpad';
import './styles.css';

requestFullscreenOnce();
installPointerFocus();
if (dpadRequested(navigator.userAgent, window.location.search)) installPointerDpad();
render(
  <>
    <App />
    <KeyLog />
  </>,
  document.getElementById('app') as HTMLElement,
);
