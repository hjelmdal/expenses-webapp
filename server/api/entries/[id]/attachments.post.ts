export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const parts = await readMultipartFormData(event)
  const n = saveImages(entry.project_id, entry.id, parts || [])
  if (n && fields(parts).read !== '0') queueReceipt(entry.id)
  return { added: n }
})
