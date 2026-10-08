/* ============================================================
   LASHES APP — SERVICE WORKER v2.0
   ============================================================ */

const CACHE_NAME = 'lashes-app-v3';
const RUNTIME_CACHE = 'lashes-runtime-v3';

// Файлы для кеширования при установке
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// ==================== INSTALL ====================
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('Precache error:', err);
      });
    })
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// ==================== FETCH ====================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Не кешируем API-запросы к Google Apps Script
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('googleusercontent.com')) {
    return; // пропускаем — работаем напрямую с сетью
  }

  // Не кешируем внешние ресурсы (Lucide, Google Fonts)
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Для остальных — стратегия: сеть → кеш
  event.respondWith(
    fetch(request)
      .then(response => {
        // Кешируем свежий ответ
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Если сеть недоступна — берем из кеша
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // Fallback для навигации
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Офлайн', { status: 503 });
        });
      })
  );
});

// ==================== MESSAGE ====================
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
