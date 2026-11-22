import { render } from 'preact';
import { App } from './app.tsx';
import { IS_OFFICE } from './config.ts';
import { POLL_MS, store } from './data/store.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

// Startup refresh before the first render, so screens share this one request instead of each fetching
if (store.state.session) void store.loadBoot();

render(<App />, document.getElementById('app')!);

// Save pending edits before the OS may freeze the app; refresh when it comes back
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void store.flush();
  else store.resume();
});
window.addEventListener('online', () => store.resume());

// Other people's changes show up without reopening the app
setInterval(() => {
  if (document.visibilityState === 'visible') void store.poll();
}, POLL_MS);

if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_OFFICE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((err) => console.error('Service worker registration failed', err));
  });
}
