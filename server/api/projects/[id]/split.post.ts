// Massefordeling: sæt samme fordeling på flere udgifter på én gang.
export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  await requireProject(event, id)
  const b = await readBody<any>(event)
  const ids = (Array.isArray(b?.ids) ? b.ids : []).map(Number).filter(Number.isInteger)
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'Vælg mindst én post' })
  if (!('split' in (b || {}))) throw createError({ statusCode: 400, statusMessage: 'Mangler fordeling' })
  const { split } = entryPatch({ split: b.split }, participantIds(id))
  const r = useDb().prepare(`UPDATE entries SET split = ? WHERE project_id = ? AND kind IN ('expense', 'credit') AND id IN (${ids.map(() => '?').join(', ')})`)
    .run(split, id, ...ids)
  return { updated: Number(r.changes) }
})
