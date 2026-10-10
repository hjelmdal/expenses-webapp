// Markedskurser fra ECB via frankfurter.dev (gratis, ingen nøgle; har THB).
// Caches pr. (valuta, dato) i SQLite, så en tur kun slår hver dag op én gang.
const today = () => new Date().toISOString().slice(0, 10)

export async function marketRate(currency: string, base: string, date: string): Promise<number | null> {
  if (currency === base) return 1
  const db = useDb()
  const d = date > today() ? today() : date
  const hit = db.prepare('SELECT rate FROM rates WHERE currency = ? AND base = ? AND date = ?').get(currency, base, d) as any
  if (hit) return hit.rate
  try {
    const path = d === today() ? 'latest' : d
    const res = await $fetch<any>(`https://api.frankfurter.dev/v1/${path}`, {
      query: { base: currency, symbols: base }, timeout: 6000,
    })
    const rate = Number(res?.rates?.[base])
    if (rate > 0) {
      db.prepare('INSERT OR REPLACE INTO rates (currency, base, date, rate) VALUES (?, ?, ?, ?)').run(currency, base, d, rate)
      return rate
    }
  } catch { /* offline/ukendt valuta — fald tilbage nedenfor */ }
  const near = db.prepare(`SELECT rate FROM rates WHERE currency = ? AND base = ?
    ORDER BY abs(julianday(date) - julianday(?)) LIMIT 1`).get(currency, base, d) as any
  return near?.rate ?? null
}
