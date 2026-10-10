export default defineEventHandler(async (event) => {
  const pid = intParam(event, 'pid')
  const p = useDb().prepare('SELECT * FROM participants WHERE id = ?').get(pid) as any
  if (!p) throw createError({ statusCode: 404 })
  await requireProject(event, p.project_id)
  const b = await readBody<any>(event)
  const name = b.name != null ? String(b.name).trim() || p.name : p.name
  const weight = Number(b.weight) > 0 ? Number(b.weight) : p.weight
  useDb().prepare('UPDATE participants SET name = ?, weight = ? WHERE id = ?').run(name, weight, pid)
  return { ok: true }
})
