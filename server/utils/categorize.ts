// Kategorisering af poster uden kvittering (eller ældre poster) ud fra tekst —
// en hurtig `claude -p --model haiku` uden værktøjer. Én ad gangen; rører aldrig
// en kategori brugeren eller aflæsningen allerede har sat.
const queue: number[] = []
let running = false

export function queueCategorize(entryId: number) {
  if (!queue.includes(entryId)) queue.push(entryId)
  void pump()
}

// Ved opstart: udgifter med tekst men uden kategori (fx fra før kategorierne fandtes).
export function backfillCategories() {
  const rows = useDb().prepare(`SELECT id FROM entries WHERE kind IN ('expense', 'credit') AND category IS NULL
    AND status = 'ready' AND coalesce(merchant, description) IS NOT NULL`).all() as any[]
  for (const r of rows) queueCategorize(r.id)
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const id = queue.shift()!
      try { await categorizeOne(id) } catch (err) { console.error('[categorize]', id, err) }
    }
  } finally { running = false }
}

async function categorizeOne(id: number) {
  const db = useDb()
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any
  if (!e || !isSpend(e.kind) || e.category || e.status === 'reading') return
  const text = [e.merchant, e.description].filter(Boolean).join(' — ')
  if (!text) return
  const prompt = `Vælg den bedste kategori for en rejseudgift. Svar KUN med nøglen, intet andet.
Kategorier: ${CATEGORIES.map(c => `${c.key} = ${c.label} (${c.hint})`).join('; ')}.
${e.kind === 'credit' ? 'Rabat/credit (vælg kategorien for det, rabatten gælder)' : 'Udgift'}: "${text.slice(0, 400)}" — ${e.amount ?? '?'} ${e.currency}${e.method === 'room' ? ' (skrevet på hotelregningen)' : ''}`
  const out = (await runClaude(prompt, { model: 'haiku', read: false })).toLowerCase()
  const key = CATEGORY_KEYS.find(k => new RegExp(`\\b${k}\\b`).test(out))
  if (key) db.prepare(`UPDATE entries SET category = ? WHERE id = ? AND category IS NULL`).run(key, id)
}
