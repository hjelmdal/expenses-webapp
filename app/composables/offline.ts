// Offline-kopi af en tur: når turens data er hentet med net, hentes poster, der er ændret siden
// sidst, og alle kvitteringsbilleder i baggrunden, så hele turen kan ses uden net. Service
// workeren (sw/sw.js) gemmer svarene i sin cache (DATA). Arkiverede ture hentes ikke, og
// deres kopi ryddes væk fra telefonen.
const DATA = 'data-v1' // samme navn som i sw/sw.js
const key = (pid: number) => `expenses-offline-${pid}`
type Saved = { entries: Record<string, string>, images: number[] }

function load(pid: number): Saved {
  try { return JSON.parse(localStorage.getItem(key(pid)) || '') } catch { return { entries: {}, images: [] } }
}
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) }
const url = (path: string) => `${useRuntimeConfig().app.baseURL.replace(/\/$/, '')}/api${path}`

// Hent gennem service workeren. false = intet net / login udløbet — stop for denne gang.
async function get(u: string) {
  try {
    const r = await fetch(u, { redirect: 'manual' })
    if (r.type === 'opaqueredirect' || !r.ok || r.headers.has('x-offline-cache')) return false
    await r.blob()
    return true
  } catch { return false }
}

let running = false
export async function keepTripOffline(pid: number, data: any) {
  if (running || !data?.project || data.project.archived || !navigator.serviceWorker) return
  // Første gang appen åbnes, er service workeren ikke aktiv endnu — så prøv, når den bliver det.
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => keepTripOffline(pid, data), { once: true })
    return
  }
  running = true
  try {
    const saved = load(pid)
    const save = () => localStorage.setItem(key(pid), JSON.stringify(saved))
    const cache = await caches.open(DATA)
    // Slettede poster: ryd deres kopi.
    const ids = new Set(data.entries.map((e: any) => String(e.id)))
    for (const id of Object.keys(saved.entries)) {
      if (!ids.has(id)) { await cache.delete(url(`/entries/${id}`)); delete saved.entries[id] }
    }
    save()
    for (const e of data.entries) {
      const k = hash(JSON.stringify(e))
      if (saved.entries[e.id] !== k) {
        if (!await get(url(`/entries/${e.id}`))) return
        saved.entries[e.id] = k
        save()
      }
      for (const a of e.attachments || []) {
        if (saved.images.includes(a)) continue
        if (!await get(attUrl(a))) return
        saved.images.push(a)
        save()
      }
    }
  } finally { running = false }
}

// Arkiverede ture: fjern deres poster og billeder fra telefonen.
export async function forgetArchived(projects: any[]) {
  if (!('caches' in window)) return
  for (const p of projects || []) {
    if (!p.archived || localStorage.getItem(key(p.id)) == null) continue
    const saved = load(p.id)
    const cache = await caches.open(DATA)
    for (const a of saved.images || []) await cache.delete(attUrl(a))
    for (const id of Object.keys(saved.entries || {})) await cache.delete(url(`/entries/${id}`))
    await cache.delete(url(`/projects/${p.id}`))
    localStorage.removeItem(key(p.id))
  }
}
