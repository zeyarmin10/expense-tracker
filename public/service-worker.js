/*
 * Web app-shell cache. Financial records are intentionally NOT cached here:
 * they are stored per user by OfflineStoreService in IndexedDB instead.
 */
const SHELL_CACHE = 'kyat-wise-shell-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/images/Kyat-Wise-Logo.png',
  '/images/Kyat-Wise-Logo-Large.png',
  '/assets/i18n/en.json',
  '/assets/i18n/my.json',
  '/assets/i18n/km.json',
  '/assets/i18n/th.json',
  '/assets/i18n/ja.json',
];

// Firebase Messaging must use the same root-scoped worker as the app shell;
// see NotificationService.registerMessagingServiceWorker().
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDJJXDNDCIweU0FzYIZJCMErKHcSLbzvS8',
  authDomain: 'expense-tracker-c94e8.firebaseapp.com',
  databaseURL: 'https://expense-tracker-c94e8-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'expense-tracker-c94e8',
  storageBucket: 'expense-tracker-c94e8.firebasestorage.app',
  messagingSenderId: '114245767214',
  appId: '1:114245767214:web:d08b6a34f2ff7859d70fbf',
  measurementId: 'G-V9NT25DZGJ',
});

firebase.messaging().onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Kyat Wise';
  return self.registration.showNotification(title, {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/images/Kyat-Wise-Logo.png',
    badge: '/favicon.ico',
    data: { link: payload.fcmOptions?.link || payload.data?.link || '/expense' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || '/expense';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    const matchingClient = clientList.find((client) => {
      try {
        return new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname;
      } catch (_) {
        return false;
      }
    });
    return matchingClient ? matchingClient.focus() : clients.openWindow(targetUrl);
  }));
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_ASSETS);

    // Angular emits hashed JS/CSS filenames, so discover the current shell
    // from index.html instead of keeping fragile generated filenames here.
    try {
      const response = await fetch('/', { cache: 'no-store' });
      const html = await response.clone().text();
      await cache.put('/', response);
      const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => new URL(match[1], self.location.origin))
        .filter((url) => url.origin === self.location.origin)
        .map((url) => url.pathname + url.search);
      await cache.addAll(urls);
    } catch (_) {
      // CORE_ASSETS is still enough to serve the fallback shell after a
      // successful install. A later online visit fills the runtime cache.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('kyat-wise-shell-') && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Firebase/API calls must always reach the network. Their per-user offline
  // copy lives in IndexedDB, never in a shared browser HTTP cache.
  if (url.pathname.includes('firebasedatabase.app') || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        await cache.put('/', response.clone());
        return response;
      } catch (_) {
        return (await caches.match('/')) || (await caches.match('/index.html'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/') || /\.(?:js|css|woff2?|ttf)$/i.test(url.pathname))) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
