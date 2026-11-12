import { render } from 'preact';
import { App } from './app.tsx';
import { IS_OFFICE } from './config.ts';
import { store } from './data/store.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

render(<App />, document.getElementById('app')!);

// Save pending edits before the OS may freeze the app; refresh when it comes back
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void store.flush();
  else store.resume();
});

if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_OFFICE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((err) => console.error('Service worker registration failed', err));
  });
}
