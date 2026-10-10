// Regner en hel tur igennem: kurs og grundbeløb pr. post, fordeling pr.
// deltager og overblikket. Alt beregnes ved læsning, så en rettet hævning
// eller fordeling slår igennem overalt med det samme.
export type Split = { mode: 'equal', pids: number[] } | { mode: 'weights', shares: Record<string, number> }

export function parseSplit(raw: string | null): Split | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// Andele (summen 1) pr. deltager-id for en post.
export function shareFractions(split: Split | null): Record<number, number> {
  const out: Record<number, number> = {}
  if (!split) return out
  if (split.mode === 'equal') {
    const ids = split.pids || []
    for (const id of ids) out[id] = 1 / ids.length
  } else {
    const entries = Object.entries(split.shares || {}).filter(([, w]) => Number(w) > 0)
    const sum = entries.reduce((s, [, w]) => s + Number(w), 0)
    for (const [id, w] of entries) out[Number(id)] = Number(w) / sum
  }
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function loadLedger(projectId: number) {
  const db = useDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
  const participants = db.prepare('SELECT * FROM participants WHERE project_id = ? ORDER BY sort, id').all(projectId) as any[]
  const members = (db.prepare('SELECT email FROM members WHERE project_id = ? ORDER BY email').all(projectId) as any[]).map(m => m.email)
  const rows = db.prepare('SELECT * FROM entries WHERE project_id = ? ORDER BY occurred_at DESC, id DESC').all(projectId) as any[]
  const atts = db.prepare(`SELECT a.id, a.entry_id FROM attachments a JOIN entries e ON e.id = a.entry_id
    WHERE e.project_id = ? ORDER BY a.id`).all(projectId) as any[]
  const base = project.base_currency

  // Kontantkurs pr. valuta = hvad hævningerne reelt kostede (inkl. gebyrer).
  const cashRate: Record<string, number> = {}
  const wd: Record<string, { amt: number, base: number }> = {}
  for (const e of rows) {
    if (e.kind === 'withdrawal' && e.amount > 0 && e.base_amount > 0) {
      wd[e.currency] ||= { amt: 0, base: 0 }
      wd[e.currency].amt += e.amount
      wd[e.currency].base += e.base_amount
    }
  }
  for (const [c, v] of Object.entries(wd)) cashRate[c] = v.base / v.amt

  const entries = []
  for (const e of rows) {
    let rate: number | null = null
    let rateSource = 'market'
    if (e.base_amount != null && e.amount) { rate = e.base_amount / e.amount; rateSource = 'fixed' }
    else if (e.method === 'cash' && cashRate[e.currency]) { rate = cashRate[e.currency]; rateSource = 'cash' }
    else rate = await marketRate(e.currency, base, e.occurred_at)
    const amount = Number(e.amount) || 0
    const split = parseSplit(e.split)
    entries.push({
      ...e,
      split,
      rate,
      rate_source: rateSource,
      base_value: rate != null ? round2(amount * rate) : null,
      base_tip: rate != null ? round2((Number(e.tip) || 0) * rate) : null,
      attachments: atts.filter(a => a.entry_id === e.id).map(a => a.id),
    })
  }

  // Overblik
  const per: Record<number, { share: number, paid: number }> = {}
  for (const p of participants) per[p.id] = { share: 0, paid: 0 }
  let spent = 0, income = 0, tips = 0, unsplit = 0, unconverted = 0, reading = 0
  const byCurrency: Record<string, number> = {}
  const cash: Record<string, number> = {}
  for (const e of entries) {
    if (e.status === 'reading') reading++
    const amt = Number(e.amount) || 0
    if (e.kind === 'withdrawal') { cash[e.currency] = (cash[e.currency] || 0) + amt; continue }
    if (e.method === 'cash') cash[e.currency] = (cash[e.currency] || 0) + (e.kind === 'income' ? amt : -amt)
    if (e.kind === 'income') { income += e.base_value || 0; continue }
    byCurrency[e.currency] = (byCurrency[e.currency] || 0) + amt
    if (e.base_value == null) { if (amt) unconverted++; continue }
    spent += e.base_value
    tips += e.base_tip || 0
    if (e.paid_by && per[e.paid_by]) per[e.paid_by].paid += e.base_value
    const fr = shareFractions(e.split)
    if (!Object.keys(fr).length) { unsplit += e.base_value; continue }
    for (const [pid, f] of Object.entries(fr)) if (per[Number(pid)]) per[Number(pid)].share += e.base_value * f
  }

  return {
    project, participants, members, entries,
    summary: {
      base, spent: round2(spent), income: round2(income), tips: round2(tips), unsplit: round2(unsplit),
      unconverted, reading, byCurrency, cash, cashRate,
      perParticipant: participants.map(p => ({
        id: p.id, name: p.name, share: round2(per[p.id].share), paid: round2(per[p.id].paid),
        balance: round2(per[p.id].paid - per[p.id].share),
      })),
    },
  }
}
