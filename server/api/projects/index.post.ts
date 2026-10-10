export default defineEventHandler(async (event) => {
  const email = await requireUser(event)
  const body = await readBody<any>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Navn mangler' })
  const cur = normCurrency(body?.currency) || 'DKK'
  const base = normCurrency(body?.base_currency) || 'DKK'
  const db = useDb()
  const r = db.prepare('INSERT INTO projects (name, currency, base_currency, created_by) VALUES (?, ?, ?, ?)').run(name, cur, base, email)
  const id = Number(r.lastInsertRowid)
  db.prepare('INSERT INTO members (project_id, email) VALUES (?, ?)').run(id, email)
  const people = Array.isArray(body?.participants) ? body.participants : []
  people.forEach((p: any, i: number) => {
    const n = String(p?.name || '').trim()
    if (n) db.prepare('INSERT INTO participants (project_id, name, weight, sort) VALUES (?, ?, ?, ?)').run(id, n, Number(p.weight) > 0 ? Number(p.weight) : 1, i)
  })
  return { id }
})
