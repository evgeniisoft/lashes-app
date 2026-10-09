/* ============================================================
   LASHES APP — SERVICE WORKER v4.0
   Надёжный офлайн: кэширует всё, отдаёт из кэша при офлайне
   ============================================================ */

const CACHE_NAME = 'lashes-app-v4';
const RUNTIME_CACHE = 'lashes-runtime-v4';

// Файлы для обязательного кэширования
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

  // Только GET-запросы кэшируем
  if (request.method !== 'GET') return;

  // API-запросы к Google Apps Script — не кэшируем, всегда в сеть
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // Для всего остального — стратегия "сеть с fallback на кэш"
  event.respondWith(
    fetch(request)
      .then(response => {
        // Кэшируем свежий ответ
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, clone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // Сеть недоступна — отдаём из кэша
        return caches.match(request).then(cached => {
          if (cached) return cached;
          
          // Для навигации — index.html
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          
          // Для внешних ресурсов (шрифты, иконки) — пустой ответ
          // (не ломает приложение, просто не будет иконки/шрифта)
          if (request.destination === 'font') {
            return new Response('', { status: 200 });
          }
          if (request.destination === 'image') {
            return new Response('', { 
              status: 200, 
              headers: { 'Content-Type': 'image/png' } 
            });
          }
          
          // Для всего остального — 503
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
