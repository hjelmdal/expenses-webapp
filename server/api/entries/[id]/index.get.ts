export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const ledger = await loadLedger(entry.project_id)
  const e = ledger.entries.find(x => x.id === entry.id)
  return { entry: e, project: ledger.project, participants: ledger.participants, stays: ledger.stays, cashRate: ledger.summary.cashRate }
})
