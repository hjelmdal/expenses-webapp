export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const u = entryPatch((await readBody<any>(event)) || {}, participantIds(entry.project_id))
  const keys = Object.keys(u)
  if (keys.length) useDb().prepare(`UPDATE entries SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map(k => u[k]), entry.id)
  return { ok: true }
})
