import { render } from 'preact';
import { App } from './app';
import { Intro } from './components/Intro';
import { trackViewportHeight } from './viewport';
import './styles.css';

trackViewportHeight();

render(
  <>
    <App />
    <Intro />
  </>,
  document.getElementById('app') as HTMLElement,
);
