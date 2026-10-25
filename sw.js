/* Service worker de LOGES.
   La page (index.html) est toujours demandée au réseau d'abord : chaque
   déploiement est pris en compte dès l'ouverture suivante, sans dépendre
   du numéro de version. La copie locale ne sert que hors connexion.
   Changer VERSION seulement si les icônes ou le manifeste changent. */
var VERSION = 'loges-v6-20261025';
var STATIQUE = ['manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(STATIQUE); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  // Firebase, polices et tout ce qui n'est pas sur ce site : réseau direct, jamais mis en cache
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(fetch(req).then(function (r) {
      var copie = r.clone();
      caches.open(VERSION).then(function (c) { c.put('index.html', copie); });
      return r;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
