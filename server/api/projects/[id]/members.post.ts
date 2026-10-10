export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  await requireProject(event, id)
  const email = String((await readBody<any>(event))?.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Ugyldig e-mail' })
  useDb().prepare('INSERT OR IGNORE INTO members (project_id, email) VALUES (?, ?)').run(id, email)
  return { ok: true }
})
