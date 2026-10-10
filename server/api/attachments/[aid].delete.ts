export default defineEventHandler(async (event) => {
  const aid = intParam(event, 'aid')
  const a = useDb().prepare('SELECT * FROM attachments WHERE id = ?').get(aid) as any
  if (!a) throw createError({ statusCode: 404 })
  await requireEntry(event, a.entry_id)
  useDb().prepare('DELETE FROM attachments WHERE id = ?').run(aid)
  deleteFile(a.file)
  return { ok: true }
})
