/** Device facts that drive the install and notification guidance. */

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Running from the home-screen icon (not a browser tab). */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Chrome/Android fires this once; keep it so the "install" button can trigger the native prompt later
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  for (const fn of listeners) fn();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  for (const fn of listeners) fn();
});

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export function onInstallAvailabilityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  for (const fn of listeners) fn();
  return outcome === 'accepted';
}
