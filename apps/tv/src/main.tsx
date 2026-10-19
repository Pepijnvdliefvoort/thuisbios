import { render } from 'preact';
import { App } from './app';
import { KeyLog } from './debug/KeyLog';
import { requestFullscreenOnce } from './fullscreen';
import { installPointerFocus } from './nav/pointer';
import './styles.css';

requestFullscreenOnce();
installPointerFocus();
render(
  <>
    <App />
    <KeyLog />
  </>,
  document.getElementById('app') as HTMLElement,
);
