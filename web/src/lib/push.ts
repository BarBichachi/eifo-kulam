import { api } from '../data/api.ts';
import { isIos, isStandalone } from './device.ts';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Where this device stands. iOS only allows web push from the home-screen app. */
export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks permission (must run from a tap), subscribes and registers the device with the backend. */
export async function enablePush(vapidPublicKey: string, token: string): Promise<PushState> {
  if (!vapidPublicKey) throw new Error('ההתראות עוד לא הוגדרו בשרת. פנו למנהל/ת.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another VAPID key cannot be reused
  if (sub && sub.options.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey);
    const wanted = urlBase64ToUint8Array(vapidPublicKey);
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  const json = sub.toJSON();
  await api('pushSubscribe', { subscription: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } } }, token);
  return 'on';
}

/** Re-sends this device's existing subscription so the server always has it for the logged-in member. */
export async function resyncPush(token: string): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return;
  const json = sub.toJSON();
  await api('pushSubscribe', { subscription: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } } }, token);
}

/** Removes this device's subscription locally and on the server. */
export async function disablePush(token: string): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await api('pushUnsubscribe', { endpoint: sub.endpoint }, token);
  } finally {
    await sub.unsubscribe();
  }
}

/** Shows a notification through the service worker without the server (checks permission + display). */
export async function localTestNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('בדיקה מקומית ✅', { body: 'ההרשאה פעילה והמכשיר מציג התראות', dir: 'rtl', lang: 'he', icon: 'icons/icon-192.png', tag: 'local-test' });
}
