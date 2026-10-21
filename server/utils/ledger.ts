// Regner en hel tur igennem fra databasen: kurs pr. post (fast, kontantkurs eller ECB) og
// overblikket. Selve beregningen er delt med appen (shared/utils/ledger.ts), så telefonen
// kan regne sine ventende poster med offline. Alt beregnes ved læsning, så en rettet
// hævning eller fordeling slår igennem overalt med det samme.
export async function loadLedger(projectId: number) {
  const db = useDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
  const participants = db.prepare('SELECT * FROM participants WHERE project_id = ? ORDER BY sort, id').all(projectId) as any[]
  const members = (db.prepare('SELECT email FROM members WHERE project_id = ? ORDER BY email').all(projectId) as any[]).map(m => m.email)
  const rows = db.prepare('SELECT * FROM entries WHERE project_id = ? ORDER BY occurred_at DESC, id DESC').all(projectId) as any[]
  const pays = db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY occurred_at, id').all(projectId) as any[]
  const atts = db.prepare(`SELECT a.id, a.entry_id FROM attachments a JOIN entries e ON e.id = a.entry_id
    WHERE e.project_id = ? ORDER BY a.id`).all(projectId) as any[]
  const stays = loadStays(projectId)
  const cashRate = cashRates(rows)

  const entries = []
  for (const e of rows) {
    const known = knownRate(e, cashRate)
    const rate = known ? known.rate : await marketRate(e.currency, project.base_currency, e.occurred_at)
    const own = pays.filter(p => p.entry_id === e.id)
    entries.push({
      ...enrichEntry(e, rate, known?.source || 'market', stays),
      attachments: atts.filter(a => a.entry_id === e.id).map(a => a.id),
      payments: own,
      paid: Math.round(own.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    })
  }

  return {
    project, participants, members, entries, stays, pays,
    summary: summarize({ project, participants, entries, pays, stays, cashRate }),
  }
}
