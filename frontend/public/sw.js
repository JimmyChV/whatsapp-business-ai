const CACHE_NAME = 'wa-saas-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => clients.claim())
  );
});

function isApiOrSocketRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/');
}

function isAppShellRequest(request, url) {
  return request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
}

function isFingerprintedAsset(url) {
  return /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(url.pathname);
}

function networkFirst(request, fallbackPath = '/index.html') {
  return fetch(request).then((response) => {
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => (
    cached || caches.match(fallbackPath)
  )));
}

function cacheFirstWithBackgroundUpdate(request) {
  return caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => null);

    return cached || update;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiOrSocketRequest(url)) return;

  if (isAppShellRequest(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isFingerprintedAsset(url)) {
    event.respondWith(cacheFirstWithBackgroundUpdate(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (_) {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Nuevo mensaje',
      {
        body: data.body || '',
        icon: data.icon || 'https://wa.lavitat.pe/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.chatId || 'message',
        data: {
          url: data.url || '/',
          chatId: data.chatId || '',
          tenantId: data.tenantId || '',
          moduleId: data.moduleId || ''
        },
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: false,
        renotify: true,
        silent: false
      }
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            chatId: event.notification.data?.chatId || '',
            tenantId: event.notification.data?.tenantId || '',
            moduleId: event.notification.data?.moduleId || ''
          });
          return;
        }
      }
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
