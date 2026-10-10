export default defineEventHandler(async (event) => {
  const pid = intParam(event, 'pid')
  const p = useDb().prepare('SELECT * FROM participants WHERE id = ?').get(pid) as any
  if (!p) throw createError({ statusCode: 404 })
  await requireProject(event, p.project_id)
  useDb().prepare('DELETE FROM participants WHERE id = ?').run(pid)
  return { ok: true }
})
