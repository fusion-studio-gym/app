const CACHE = 'fusion-studio-v1';
const ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/logo.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only handle GET requests for our own origin
  if(e.request.method !== 'GET') return;
  if(!e.request.url.startsWith(self.location.origin)) return;

  // Network first for Firebase (always fresh data)
  if(e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses for app shell files
        if(res.ok && ASSETS.some(a => e.request.url.endsWith(a.replace('/app','')))){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/app/')))
  );
});
