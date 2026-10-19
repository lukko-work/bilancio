// Tiene in cache i file dell'app per farla funzionare offline.
// Quando pubblichi una modifica, aumenta la versione.
const VERSIONE = 'bilancio-v1';
const FILE = ['./', 'index.html', 'styles.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'vendor/xlsx.full.min.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Prima la rete (così vedi subito gli aggiornamenti), la cache se sei offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSIONE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
