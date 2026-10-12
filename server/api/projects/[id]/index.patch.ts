export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { project } = await requireProject(event, id)
  const b = await readBody<any>(event)
  const name = b.name != null ? String(b.name).trim() || project.name : project.name
  const cur = b.currency != null ? normCurrency(b.currency) || project.currency : project.currency
  const base = b.base_currency != null ? normCurrency(b.base_currency) || project.base_currency : project.base_currency
  const archived = b.archived != null ? (b.archived ? 1 : 0) : project.archived
  const split = b.default_split !== undefined ? (['equal', 'weights'].includes(b.default_split) ? b.default_split : null) : project.default_split
  useDb().prepare('UPDATE projects SET name = ?, currency = ?, base_currency = ?, archived = ?, default_split = ? WHERE id = ?').run(name, cur, base, archived, split, id)
  return { ok: true }
})
