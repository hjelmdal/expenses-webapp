export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { email: me } = await requireProject(event, id)
  const email = String(getQuery(event).email || '').toLowerCase()
  if (email === me) throw createError({ statusCode: 400, statusMessage: 'Du kan ikke fjerne dig selv' })
  useDb().prepare('DELETE FROM members WHERE project_id = ? AND email = ?').run(id, email)
  return { ok: true }
})
