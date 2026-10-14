export default defineEventHandler(async (event) => {
  const sid = intParam(event, 'sid')
  const s = useDb().prepare('SELECT * FROM stays WHERE id = ?').get(sid) as any
  if (!s) throw createError({ statusCode: 404 })
  await requireProject(event, s.project_id)
  const b = (await readBody<any>(event)) || {}
  const name = b.name != null ? String(b.name).trim().slice(0, 100) || s.name : s.name
  const checkIn = 'check_in' in b ? normDate(b.check_in) || s.check_in : s.check_in
  const checkOut = 'check_out' in b ? normDate(b.check_out) : s.check_out
  if (checkOut && checkOut < checkIn) throw createError({ statusCode: 400, statusMessage: 'Check-ud er før check-in' })
  useDb().prepare('UPDATE stays SET name = ?, check_in = ?, check_out = ? WHERE id = ?').run(name, checkIn, checkOut, sid)
  return { ok: true }
})
