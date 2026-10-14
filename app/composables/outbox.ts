// Udbakke: nye kvitteringer og poster gemmes på telefonen (IndexedDB), FØR de sendes,
// og slettes først, når serveren har svaret OK. Svigter nettet (hotel-wifi, "Load failed"),
// ligger de der stadig og sendes igen automatisk — ved start, når nettet kommer tilbage,
// når appen kommer i forgrunden og hvert 20. sekund. Serveren genkender en post på
// client_id, så et nyt forsøg efter et tabt svar ikke giver en dobbeltpost.
export type OutboxItem = {
  id: string
  projectId: number
  type: 'photo' | 'attach' | 'entry' | 'payment' // payment: posten er oprettet, kun betalingen mangler
  created: number
  files?: Blob[]                       // allerede formindskede billeder
  fields?: Record<string, any>         // photo: dato, betaler, betalingsmåde
  entryId?: number                     // attach/payment: posten der får billederne/betalingen
  body?: Record<string, any>           // entry: hele posten
  payment?: Record<string, any> | null // entry: betaling med det samme (delvist betalt)
  tries: number
  error?: string                       // sidste fejl; 4xx = venter på brugeren
  stuck?: boolean                      // serveren afviste — prøves ikke automatisk
}

const DB_NAME = 'expenses-outbox'
const STORE = 'items'
let dbp: Promise<IDBDatabase> | null = null
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => { dbp = null; rej(r.error) }
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const d = await db()
  return new Promise<T>((res, rej) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => res(req.result)
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
  })
}

// Delt tilstand for hele appen (kun klient — appen kører uden SSR).
const pending = ref<OutboxItem[]>([])
const sentCount = ref(0) // tælles op ved hver afsendelse, så sider kan genindlæse
let flushing: Promise<void> | null = null
const inflight = new Set<string>() // sendes lige nu — samme post må ikke sendes to gange samtidig

async function reload() {
  pending.value = ((await tx<OutboxItem[]>('readonly', s => s.getAll())) || []).sort((a, b) => a.created - b.created)
}

function form(files: Blob[], extra: Record<string, any>) {
  const fd = new FormData()
  for (const f of files) fd.append('images', f, 'kvittering.jpg')
  for (const [k, v] of Object.entries(extra)) if (v != null) fd.append(k, String(v))
  return fd
}

// Sender én post. Returnerer serverens svar; kaster ved fejl. API'et redirecter aldrig — et
// redirect er Access, der vil have et nyt login, og må ikke tælle som "sendt".
const post = <T = any>(path: string, opts: any) => api<T>(path, { ...opts, redirect: 'error' })
async function send(item: OutboxItem): Promise<any> {
  if (item.type === 'photo') {
    return post(`/projects/${item.projectId}/entries`, { method: 'POST', body: form(item.files || [], { ...item.fields, client_id: item.id }) })
  }
  if (item.type === 'attach') {
    return post(`/entries/${item.entryId}/attachments`, { method: 'POST', body: form(item.files || [], {}) })
  }
  if (item.type === 'payment') {
    await post(`/entries/${item.entryId}/payments`, { method: 'POST', body: item.payment })
    return { id: item.entryId }
  }
  const r = await post<{ id: number }>(`/projects/${item.projectId}/entries`, { method: 'POST', body: { ...item.body, client_id: item.id } })
  if (item.payment) {
    // Posten er oprettet: husk det, så et nyt forsøg kun sender betalingen.
    await tx('readwrite', s => s.put({ ...item, type: 'payment', entryId: r.id, body: undefined }))
    await post(`/entries/${r.id}/payments`, { method: 'POST', body: item.payment })
  }
  return r
}

// Serveren svarede med en klientfejl (4xx): et nyt forsøg hjælper ikke. Undtagen login
// (401/403 — Access-sessionen er udløbet): så venter posten, til man har logget ind igen.
const rejected = (e: any) => { const st = e?.response?.status ?? e?.statusCode; return st >= 400 && st < 500 && ![401, 403, 408, 429].includes(st) }

async function attempt(item: OutboxItem) {
  if (inflight.has(item.id)) throw new Error('Sendes allerede')
  inflight.add(item.id)
  try {
    const r = await send(item)
    await tx('readwrite', s => s.delete(item.id))
    sentCount.value++
    return r
  } catch (e: any) {
    const latest = (await tx<OutboxItem | undefined>('readonly', s => s.get(item.id))) || item
    const st = e?.response?.status
    const error = st === 401 || st === 403 || (!e?.response && await probeLogin()) ? 'log ind igen' : e?.response ? errMsg(e) : 'ingen forbindelse'
    await tx('readwrite', s => s.put({ ...latest, tries: latest.tries + 1, error, stuck: rejected(e) }))
    throw e
  } finally { inflight.delete(item.id); await reload() }
}

// Gem lokalt, og prøv at sende med det samme. Kaster, hvis afsendelsen fejler; har
// fejlen queued = true, ligger posten i udbakken og sendes igen senere.
async function add(item: Omit<OutboxItem, 'id' | 'created' | 'tries'>) {
  const full: OutboxItem = { ...item, id: crypto.randomUUID(), created: Date.now(), tries: 0 }
  // Uden IndexedDB (fx privat browsing): send direkte som før.
  try { await tx('readwrite', s => s.put(full)) } catch { return send(full) }
  await reload()
  try {
    return await attempt(full)
  } catch (e: any) {
    // Afvist af serveren (fx ugyldigt beløb): en indtastning rettes i formularen, som stadig
    // er åben — den skal ikke ligge og vente. Billeder bevares altid.
    if (full.type === 'entry' && rejected(e)) { await remove(full.id); throw e }
    // queued = ligger sikkert i udbakken og sendes igen senere.
    throw Object.assign(e instanceof Error ? e : new Error(errMsg(e)), { queued: true })
  }
}

// Prøv alle ventende igen (én ad gangen). Afviste (4xx) springes over, medmindre force.
function flush(force = false) {
  return flushing ||= (async () => {
    try {
      await reload()
      for (const it of pending.value) {
        if (it.stuck && !force) continue
        try { await attempt(it) } catch { if (!navigator.onLine) break }
      }
    } catch {} finally { flushing = null }
  })()
}

async function remove(id: string) {
  await tx('readwrite', s => s.delete(id))
  await reload()
}

export function useOutbox() {
  return { pending, sentCount, add, flush, remove, reload }
}
