// Optælling af kontanter: forskellen mellem forventet og optalt bogføres som en
// kontantpost, så saldoen passer, og glemte småkøb tæller med i forbruget.
export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { project, email } = await requireProject(event, id)
  const b = (await readBody<any>(event)) || {}
  const currency = normCurrency(b.currency) || project.currency
  const counted = numOrNull(b.counted)
  if (counted == null || counted < 0) throw createError({ statusCode: 400, statusMessage: 'Angiv det optalte beløb' })
  const { summary } = await loadLedger(id)
  const expected = summary.cash[currency] || 0
  const diff = Math.round((expected - counted) * 100) / 100
  if (!diff) return { diff: 0 }
  const date = normDate(b.date) || new Date().toISOString().slice(0, 10)
  useDb().prepare(`INSERT INTO entries (project_id, created_by, kind, occurred_at, description, amount, currency, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'cash')`).run(id, email, diff > 0 ? 'expense' : 'income', date,
    diff > 0 ? 'Ikke-registreret kontantforbrug (optælling)' : 'Flere kontanter end forventet (optælling)', Math.abs(diff), currency)
  return { diff }
})
