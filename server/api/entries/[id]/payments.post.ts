// Registrér en (del)betaling på en "betales senere"-post, fx resten af bådturen.
export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const b = (await readBody<any>(event)) || {}
  const amount = numOrNull(b.amount)
  if (!amount || amount <= 0) throw createError({ statusCode: 400, statusMessage: 'Angiv et beløb' })
  const pids = participantIds(entry.project_id)
  const payer = pids.includes(Number(b.paid_by)) ? Number(b.paid_by) : null
  const r = useDb().prepare(`INSERT INTO payments (project_id, entry_id, amount, currency, method, paid_by, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(entry.project_id, entry.id, amount, entry.currency, b.method === 'cash' ? 'cash' : 'card',
    payer, normDate(b.date) || new Date().toISOString().slice(0, 10))
  return { id: Number(r.lastInsertRowid) }
})
