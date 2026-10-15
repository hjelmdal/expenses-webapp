// Service worker: appen kan åbne og vise de senest hentede data uden net.
// Bygges til .output/public/sw.js af nuxt.config.ts (hook nitro:build:public-assets), som
// sætter VERSION og listen over byggede filer ind — en ny version giver derfor en ny
// service worker. Nye kvitteringer/poster offline klares af udbakken (app/composables/outbox.ts).
//
//  - Sider: net først (max 3 s), ellers den gemte app-skal. Et Access-login (redirect) sendes igennem.
//  - /_nuxt/ og /brand/: fra cachen (filnavnene skifter ved hver build).
//  - Kvitteringsbilleder: fra cachen, når de først er hentet.
//  - Øvrige GET /api/: net først (max 6 s), ellers sidst hentede svar med headeren
//    x-offline-cache (tidspunkt) — appen viser så "offline · data fra kl. …".
//    x-needs-login = Access-sessionen er udløbet (redirect til login eller 401/403).
const VERSION = '__VERSION__'
const ASSETS = __ASSETS__
const STATIC = `static-${VERSION}`
// v2: v1 kunne have et forkert billede under et genbrugt billed-id (rettet i server/utils/db.ts).
const DATA = 'data-v2'

self.addEventListener('install', (e) => {
  // Alt eller intet: kan app-skal og filer ikke hentes (fx udløbet login), beholdes den gamle version.
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(['/', ...ASSETS])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== STATIC && k !== DATA) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') return e.respondWith(page(req, url))
  const p = url.pathname
  if (p.startsWith('/_nuxt/') || p.startsWith('/brand/')) return e.respondWith(cacheFirst(req, STATIC))
  if (p.startsWith('/api/attachments/')) return e.respondWith(cacheFirst(req, DATA))
  if (p === '/api/version' || p === '/sw.js') return
  if (p.startsWith('/api/')) return e.respondWith(apiGet(req))
})

const wait = ms => new Promise(r => setTimeout(r, ms))

async function page(req, url) {
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
      const copy = res.clone()
      caches.open(STATIC).then(c => c.put('/', copy))
    }
    return res
  })
  const shell = await caches.match('/', { cacheName: STATIC }) || await caches.match('/')
  // ?login: brugeren har bedt om at logge ind igen — vent på nettet.
  if (!shell || url.searchParams.has('login')) return net.catch(() => shell || Response.error())
  return Promise.race([net, wait(3000).then(() => shell)]).catch(() => shell)
}

async function cacheFirst(req, name) {
  const hit = await caches.match(req)
  if (hit) return hit
  // Forbi browserens egen HTTP-cache: den kan stadig have et gammelt svar under samme URL.
  const res = await fetch(new Request(req, { cache: 'reload' }))
  if (res.ok) {
    const copy = res.clone()
    caches.open(name).then(c => c.put(req, copy))
  }
  return res
}

async function apiGet(req) {
  const cache = await caches.open(DATA)
  const fallback = async (extra) => {
    const hit = await cache.match(req)
    if (!hit) return null
    const h = new Headers(hit.headers)
    h.set('x-offline-cache', hit.headers.get('x-cached-at') || '')
    for (const [k, v] of Object.entries(extra || {})) h.set(k, v)
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h })
  }
  const net = fetch(new Request(req, { redirect: 'manual' })).then(async (res) => {
    if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) return (await fallback({ 'x-needs-login': '1' })) || res
    if (res.status >= 500) return (await fallback()) || res
    if (res.ok) {
      const h = new Headers(res.headers)
      h.set('x-cached-at', new Date().toISOString())
      const body = await res.clone().blob()
      await cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers: h }))
    }
    return res
  })
  const slow = wait(6000).then(async () => (await fallback()) || net)
  return Promise.race([net, slow]).catch(async () => (await fallback()) || Response.error())
}
