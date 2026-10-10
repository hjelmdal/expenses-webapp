export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const db = useDb()
  const files = db.prepare('SELECT file FROM attachments WHERE entry_id = ?').all(entry.id) as any[]
  db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id)
  for (const f of files) deleteFile(f.file)
  return { ok: true }
})
