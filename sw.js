const CACHE = 'pushpull-v2';
const ASSETS = [
  '/push_pull-ups/',
  '/push_pull-ups/index.html',
  '/push_pull-ups/manifest.json',
  '/push_pull-ups/icons/icon.svg',
  '/push_pull-ups/assets/tracker.js',
  '/push_pull-ups/assets/tracker-core.js',
  '/push_pull-ups/assets/tracker-parse.js',
  '/push_pull-ups/assets/tracker-store.js',
  '/push_pull-ups/assets/tracker-github.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Чужие домены (в первую очередь api.github.com) не кэшируем никогда:
  // закэшированный ответ вернул бы устаревший sha и синхронизация ушла бы в вечный конфликт.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
