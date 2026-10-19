import { render } from 'preact';
import { App } from './app';
import { requestFullscreenOnce } from './fullscreen';
import './styles.css';

requestFullscreenOnce();
render(<App />, document.getElementById('app') as HTMLElement);
