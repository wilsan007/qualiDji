/* QualiDji service worker — §13 « cache autorisé ».
 * - Shell applicatif : cache-first (reprise rapide, navigation hors ligne).
 * - API (/api/, /auth/, /rest/, /storage/) : JAMAIS cachée (données + auth).
 */
const SHELL = 'qualidji-shell-v1'
const SHELL_URLS = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Jamais de cache sur les données authentifiées ni les appels API
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) {
    return // défaut réseau
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request)
        .then((res) => {
          // Navigation : on met en cache le shell pour la reprise hors ligne
          if (event.request.mode === 'navigate') {
            const clone = res.clone()
            caches.open(SHELL).then((cache) => cache.put('/', clone))
            return res
          }
          return res
        })
        .catch(() => caches.match('/'))
    })
  )
})
