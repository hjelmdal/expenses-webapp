export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  await requireProject(event, id)
  const b = await readBody<any>(event)
  const name = String(b?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Navn mangler' })
  const db = useDb()
  const sort = (db.prepare('SELECT coalesce(max(sort), -1) + 1 AS s FROM participants WHERE project_id = ?').get(id) as any).s
  const r = db.prepare('INSERT INTO participants (project_id, name, weight, sort) VALUES (?, ?, ?, ?)').run(id, name, Number(b.weight) > 0 ? Number(b.weight) : 1, sort)
  return { id: Number(r.lastInsertRowid) }
})
