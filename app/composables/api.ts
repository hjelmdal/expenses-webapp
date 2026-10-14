// Alle kald går relativt til appens base-URL (rod på egen host, /<id>/ på sti).
export function api<T = any>(path: string, opts: any = {}) {
  const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
  const { onResponse, onRequestError } = opts
  return $fetch<T>(`${base}/api${path}`, {
    ...opts,
    onResponse(ctx: any) { noteResponse(ctx.response); return onResponse?.(ctx) },
    onRequestError(ctx: any) { noteNoResponse(); return onRequestError?.(ctx) },
  })
}

export function attUrl(id: number) {
  return `${useRuntimeConfig().app.baseURL.replace(/\/$/, '')}/api/attachments/${id}`
}

export function errMsg(e: any) {
  // Intet svar (offline, hotel-wifi): Safari siger bare "Load failed".
  if (e?.name === 'FetchError' && !e.response) return 'Ingen forbindelse — prøv igen, når der er net'
  return e?.data?.statusMessage || e?.statusMessage || e?.message || 'Noget gik galt'
}

export function money(v: number | null | undefined, cur: string, digits?: number) {
  if (v == null || !isFinite(v)) return '—'
  const d = digits ?? (Math.abs(v) >= 1000 || Number.isInteger(v) ? 0 : 2)
  try {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
  } catch { return `${v.toFixed(d)} ${cur}` }
}

// Talfelt fra en input (accepterer komma som decimaltegn); tomt/ugyldigt = 0.
export const parseAmount = (v: any) => Number(String(v ?? '').replace(',', '.')) || 0

export function localDate(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

export function dayLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  const t = localDate()
  const y = localDate(new Date(Date.now() - 864e5))
  if (iso === t) return 'I dag'
  if (iso === y) return 'I går'
  return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Turen appen åbner på (pr. enhed) — se middleware/start-trip.global.ts.
export const START_TRIP_KEY = 'expenses-start-trip'

export const KIND_LABEL: Record<string, string> = { expense: 'Udgift', credit: 'Rabat', income: 'Indtægt', withdrawal: 'Hævning', deposit: 'Depositum' }

// Skalerer et foto ned til maks 2000 px JPEG før upload — kvitteringer kan
// stadig læses, og det går hurtigt på hotel-wifi. Kan billedet ikke dekodes
// (fx HEIC i en browser uden støtte), sendes originalen.
export async function shrinkImage(file: File, max = 2000): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * scale)
    c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(url)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob || file
  } catch { return file }
}
