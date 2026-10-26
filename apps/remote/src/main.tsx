import { render } from 'preact';
import { App } from './app';
import { trackViewportHeight } from './viewport';
import './styles.css';

trackViewportHeight();

render(<App />, document.getElementById('app') as HTMLElement);
