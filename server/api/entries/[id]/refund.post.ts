// Depositum er kommet retur (helt). Kontant kommer det tilbage i pungen.
export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  if (entry.kind !== 'deposit') throw createError({ statusCode: 400, statusMessage: 'Kun depositum kan komme retur' })
  const date = normDate((await readBody<any>(event))?.date) || new Date().toISOString().slice(0, 10)
  useDb().prepare(`UPDATE entries SET settled_at = ?, settled_method = 'refund', refunded = amount, updated_at = datetime('now') WHERE id = ?`).run(date, entry.id)
  return { ok: true }
})
