// Opret en post: billeder og/eller felter. Er der billeder, gemmes posten med
// det samme og aflæses i baggrunden (status 'reading').
export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { project, email } = await requireProject(event, id)
  const ct = getHeader(event, 'content-type') || ''
  const parts = ct.includes('multipart') ? await readMultipartFormData(event) : undefined
  const body = parts ? fields(parts) : (await readBody<any>(event)) || {}
  // Sendt igen fra telefonens udbakke, efter at svaret gik tabt: posten findes allerede.
  const clientId = String(body.client_id || '').slice(0, 64) || null
  if (clientId) {
    const dup = useDb().prepare('SELECT id FROM entries WHERE project_id = ? AND client_id = ?').get(id, clientId) as any
    if (dup) return { id: dup.id }
  }
  const hasImages = !!parts?.some(p => p.name === 'images' && p.data?.length)
  const u = entryPatch(body, participantIds(id))
  if (!hasImages && u.amount == null) throw createError({ statusCode: 400, statusMessage: 'Angiv et beløb eller tag et billede' })
  const row = {
    kind: 'expense', method: 'card', currency: project.currency,
    occurred_at: new Date().toISOString().slice(0, 10), ...u, client_id: clientId,
  }
  if (isSpend(row.kind) && !('split' in body)) (row as any).split = defaultSplit(project)
  // Tilføjet fra et hotels regning: posten hører til det hotel.
  const stay = loadStays(id).find(s => s.id === Number(body.stay_id))
  if (stay) (row as any).stay_id = stay.id
  const db = useDb()
  const keys = Object.keys(row)
  const r = db.prepare(`INSERT INTO entries (project_id, created_by, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`)
    .run(id, email, ...keys.map(k => (row as any)[k]))
  const entryId = Number(r.lastInsertRowid)
  if (hasImages) {
    try { saveImages(id, entryId, parts!) } catch (e) { db.prepare('DELETE FROM entries WHERE id = ?').run(entryId); throw e }
    queueReceipt(entryId)
  } else if (isSpend(row.kind) && !(row as any).category) queueCategorize(entryId)
  return { id: entryId }
})
