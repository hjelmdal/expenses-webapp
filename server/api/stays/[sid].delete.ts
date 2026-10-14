// Sletter kun opholdet — posterne bliver, og placeres igen ud fra datoen.
export default defineEventHandler(async (event) => {
  const sid = intParam(event, 'sid')
  const s = useDb().prepare('SELECT * FROM stays WHERE id = ?').get(sid) as any
  if (!s) throw createError({ statusCode: 404 })
  await requireProject(event, s.project_id)
  const db = useDb()
  db.prepare('UPDATE entries SET stay_id = NULL WHERE stay_id = ?').run(sid)
  db.prepare('DELETE FROM stays WHERE id = ?').run(sid)
  return { ok: true }
})
