/* eslint-disable no-undef */
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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'SpendWise';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/images/SpendWise-Logo.png',
    badge: '/favicon.ico',
    data: {
      link: payload.fcmOptions?.link || payload.data?.link || '/expense',
    },
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || '/expense';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => {
        try {
          return new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname;
        } catch {
          return false;
        }
      });

      if (matchingClient) {
        return matchingClient.focus();
      }

      return clients.openWindow(targetUrl);
    }),
  );
});
