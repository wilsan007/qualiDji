import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'
import { defaultCache } from '@serwist/next/worker'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventImport('install', (event) => {
  event.waitUntil(serwist.precacheAndRoute())
})

serwist.addEventImport('activate', (event) => {
  event.waitUntil(
    Promise.all([
      serwist.activate(),
      caches.keys().then((names) =>
        Promise.all(
          names.filter((name) => !name.startsWith('serwist-')).map((name) => caches.delete(name)),
        ),
      ),
    ]),
  )
})

serwist.addEventImport('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline') as Promise<Response>),
    )
  }
})

serwist.addEventImport('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
