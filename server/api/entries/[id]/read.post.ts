// Aflæs igen. Med ?reset=1 ryddes de aflæste felter først, så alt fyldes på ny.
export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  if (getQuery(event).reset) useDb().prepare('UPDATE entries SET amount = NULL, tip = 0, service = 0, merchant = NULL, description = NULL WHERE id = ?').run(entry.id)
  queueReceipt(entry.id)
  return { ok: true }
})
