const CACHE_NAME = 'lashes-app-v2'; // Увеличьте версию!

self.addEventListener('install', event => {
  self.skipWaiting(); // Немедленно активировать
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './manifest.json'
      ]);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Стратегия: СНАЧАЛА СЕТЬ, ПОТОМ КЭШ (для быстрых обновлений)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Кэшируем свежий ответ
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Если сеть недоступна - берем из кэша
        return caches.match(event.request);
      })
  );
});
