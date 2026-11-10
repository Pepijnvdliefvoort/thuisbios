import { render } from 'preact';
import { App } from './app';
import { trackViewportHeight } from './viewport';
import './styles.css';

trackViewportHeight();

// Keeps a copy of the app on the phone so it opens without a network. Failure is silent: the app works without it.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    } catch (e) {
      // Registration unavailable (private mode, blocked): carry on without offline start.
    }
  });
}

render(<App />, document.getElementById('app') as HTMLElement);
