// "Hotelregningen er betalt": lukker alle åbne regningsposter i én valuta.
// Er det trukne DKK-beløb kendt, får posterne den reelle kurs (som ved hævninger).
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
  const total = open.reduce((s, e) => s + onTab(e), 0)
  const rate = charged && total > 0 ? charged / total : null
  const upd = db.prepare(`UPDATE entries SET settled_at = ?, settled_method = ?, paid_by = coalesce(?, paid_by),
    base_amount = coalesce(?, base_amount), updated_at = datetime('now') WHERE id = ?`)
  for (const e of open) upd.run(date, method, payer, rate != null ? Math.round((Number(e.amount) || 0) * rate * 100) / 100 : null, e.id)
  return { settled: open.length, total }
})
