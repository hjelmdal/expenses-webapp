// "Hotelregningen er betalt": lukker alle åbne regningsposter i én valuta.
// Åbne depositum i samme valuta kan modregnes: de dækker regningen først, et
// overskud kommer retur, og kun resten betales (registreres som en betaling, så
// kontant rest trækkes fra pungen). Er det trukne DKK-beløb for resten kendt, får
// posterne den reelle kurs.
export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { project } = await requireProject(event, id)
  const b = (await readBody<any>(event)) || {}
  const currency = normCurrency(b.currency) || project.currency
  const method = b.method === 'cash' ? 'cash' : 'card'
  const date = normDate(b.date) || new Date().toISOString().slice(0, 10)
  const pids = participantIds(id)
  const payer = pids.includes(Number(b.paid_by)) ? Number(b.paid_by) : null
  const charged = numOrNull(b.base_amount)
  const db = useDb()
  const open = db.prepare(`SELECT * FROM entries WHERE project_id = ? AND method = 'room' AND settled_at IS NULL
    AND kind = 'expense' AND currency = ?`).all(id, currency) as any[]
  if (!open.length) throw createError({ statusCode: 400, statusMessage: 'Ingen åben regning' })
  const onTab = (e: any) => (Number(e.amount) || 0) - (e.tip_cash ? Number(e.tip) || 0 : 0)
  const total = Math.round(open.reduce((s, e) => s + onTab(e), 0) * 100) / 100

  let left = total, applied = 0, refunded = 0
  if (b.use_deposits) {
    const deps = db.prepare(`SELECT * FROM entries WHERE project_id = ? AND kind = 'deposit' AND settled_at IS NULL
      AND currency = ? ORDER BY occurred_at, id`).all(id, currency) as any[]
    const upd = db.prepare(`UPDATE entries SET settled_at = ?, settled_method = 'applied', refunded = ?, updated_at = datetime('now') WHERE id = ?`)
    for (const d of deps) {
      const amt = Number(d.amount) || 0
      const used = Math.min(amt, left)
      left = Math.round((left - used) * 100) / 100
      applied += used; refunded += amt - used
      upd.run(date, Math.round((amt - used) * 100) / 100, d.id)
    }
  }
  const remainder = left
  if (remainder > 0) {
    db.prepare(`INSERT INTO payments (project_id, entry_id, amount, currency, method, paid_by, occurred_at, note)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'Hotelregning')`).run(id, remainder, currency, method, payer, date)
  }
  const rate = charged && remainder > 0 ? charged / remainder : null
  const upd = db.prepare(`UPDATE entries SET settled_at = ?, settled_method = ?, paid_by = coalesce(?, paid_by),
    base_amount = coalesce(?, base_amount), updated_at = datetime('now') WHERE id = ?`)
  for (const e of open) upd.run(date, remainder > 0 ? method : 'deposit', payer, rate != null ? Math.round((Number(e.amount) || 0) * rate * 100) / 100 : null, e.id)
  return { settled: open.length, total, applied, refunded, remainder }
})
