// Service worker: offline app shell + Web Push. Plain JS, served as-is from the site root.
const VERSION = 'v1';
const CACHE = `eifo-kulam-${VERSION}`;
const SHELL_KEY = new URL('./', self.location.href).href;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('eifo-kulam-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Pages: network first (fresh deploys), cached shell when offline. Hashed assets/icons: cache first.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(SHELL_KEY, res.clone());
          return res;
        } catch {
          return (await cache.match(SHELL_KEY)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (/\/(assets|icons)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'איפה כולם';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'eifo-kulam',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || SHELL_KEY },
    }),
  );
});

// Focus an open app window and route it, or open a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || SHELL_KEY;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(SHELL_KEY) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
