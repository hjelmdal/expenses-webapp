export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  const { email } = await requireProject(event, id)
  return { me: email, ...(await loadLedger(id)) }
})
