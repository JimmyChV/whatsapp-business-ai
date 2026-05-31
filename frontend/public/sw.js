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

function updateAppShellCache(request) {
  return fetch(request).then((response) => {
    if (response && response.status === 200) {
      const indexClone = response.clone();
      const requestClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put('/index.html', indexClone);
        cache.put(request, requestClone);
      });
    }
    return response;
  }).catch(() => null);
}

function appShellCacheFirst(request) {
  return caches.match('/index.html').then((cached) => {
    const update = updateAppShellCache(request);
    return cached || update.then((response) => response || caches.match('/index.html'));
  });
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
    event.respondWith(appShellCacheFirst(request));
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
        badge: data.badge || 'https://wa.lavitat.pe/icons/icon-192.png',
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
        silent: false,
        actions: [
          { action: 'reply', title: 'Responder' },
          { action: 'view', title: 'Ver chat' }
        ]
      }
    )
  );
});

function withNotificationParams(url = '/', data = {}, shouldFocusInput = false) {
  try {
    const parsed = new URL(url || '/', self.location.origin);
    const chatId = String(data?.chatId || '').trim();
    const tenantId = String(data?.tenantId || '').trim();
    const moduleId = String(data?.moduleId || '').trim();
    if (chatId) {
      parsed.searchParams.set('chat', chatId);
      parsed.searchParams.set('chatId', chatId);
    }
    if (tenantId) parsed.searchParams.set('tenantId', tenantId);
    if (moduleId) parsed.searchParams.set('moduleId', moduleId);
    if (shouldFocusInput) parsed.searchParams.set('focus', 'input');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_) {
    const chatId = encodeURIComponent(String(data?.chatId || '').trim());
    const focusParam = shouldFocusInput ? '&focus=input' : '';
    return chatId ? `/?chatId=${chatId}${focusParam}` : `/${shouldFocusInput ? '?focus=input' : ''}`;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const shouldFocusInput = event.action === 'reply';
  const targetUrl = withNotificationParams(data.url || '/', data, shouldFocusInput);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            chatId: data.chatId || '',
            tenantId: data.tenantId || '',
            moduleId: data.moduleId || '',
            focusInput: shouldFocusInput
          });
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
