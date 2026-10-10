// Opret en post: billeder og/eller felter. Er der billeder, gemmes posten med
// det samme og aflæses i baggrunden (status 'reading').
export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { project, email } = await requireProject(event, id)
  const ct = getHeader(event, 'content-type') || ''
  const parts = ct.includes('multipart') ? await readMultipartFormData(event) : undefined
  const body = parts ? fields(parts) : (await readBody<any>(event)) || {}
  const hasImages = !!parts?.some(p => p.name === 'images' && p.data?.length)
  const u = entryPatch(body, participantIds(id))
  if (!hasImages && u.amount == null) throw createError({ statusCode: 400, statusMessage: 'Angiv et beløb eller tag et billede' })
  const row = {
    kind: 'expense', method: 'card', currency: project.currency,
    occurred_at: new Date().toISOString().slice(0, 10), ...u,
  }
  const db = useDb()
  const keys = Object.keys(row)
  const r = db.prepare(`INSERT INTO entries (project_id, created_by, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`)
    .run(id, email, ...keys.map(k => (row as any)[k]))
  const entryId = Number(r.lastInsertRowid)
  if (hasImages) {
    try { saveImages(id, entryId, parts!) } catch (e) { db.prepare('DELETE FROM entries WHERE id = ?').run(entryId); throw e }
    queueReceipt(entryId)
  }
  return { id: entryId }
})
