export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  await requireProject(event, id)
  const b = (await readBody<any>(event)) || {}
  const name = String(b.name || '').trim().slice(0, 100)
  const checkIn = normDate(b.check_in)
  if (!name || !checkIn) throw createError({ statusCode: 400, statusMessage: 'Navn og check-in mangler' })
  const checkOut = normDate(b.check_out)
  if (checkOut && checkOut < checkIn) throw createError({ statusCode: 400, statusMessage: 'Check-ud er før check-in' })
  const r = useDb().prepare('INSERT INTO stays (project_id, name, check_in, check_out) VALUES (?, ?, ?, ?)').run(id, name, checkIn, checkOut)
  return { id: Number(r.lastInsertRowid) }
})
