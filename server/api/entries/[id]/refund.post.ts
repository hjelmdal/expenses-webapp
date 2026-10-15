// Afstem et depositum: hvor meget kom retur, hvordan og hvornår. Resten er modregnet
// (skade, forbrug …) og tæller som forbrug. Kontant retur lægges i pungen — også når
// depositummet blev betalt med kort. Gælder både depositum-poster og "heraf depositum"
// på en udgift. { undo: true } gør det uafstemt igen.
// Body: { back?: tal (standard: det hele), method?: 'card' | 'cash', date? }
export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const b = (await readBody<any>(event)) || {}
  const isDeposit = entry.kind === 'deposit'
  const held = isDeposit ? Number(entry.amount) || 0 : entry.kind === 'expense' ? Number(entry.deposit) || 0 : 0
  if (!(held > 0)) throw createError({ statusCode: 400, statusMessage: 'Posten har intet depositum' })
  const db = useDb()
  if (b.undo) {
    if (isDeposit && entry.settled_method === 'applied') throw createError({ statusCode: 400, statusMessage: 'Depositummet er modregnet i hotelregningen — genåbn regningen i stedet' })
    db.prepare(`UPDATE entries SET deposit_back = NULL, deposit_back_method = NULL, deposit_back_at = NULL
      ${isDeposit ? ", settled_at = NULL, settled_method = NULL, refunded = 0" : ''}, updated_at = datetime('now') WHERE id = ?`).run(entry.id)
    return { ok: true }
  }
  const back = b.back == null || b.back === '' ? held : numOrNull(b.back)
  if (back == null || back < 0 || back > held + 0.004) throw createError({ statusCode: 400, statusMessage: `Retur skal være mellem 0 og ${held}` })
  const method = b.method === 'cash' || b.method === 'card' ? b.method : entry.method === 'cash' ? 'cash' : 'card'
  const date = normDate(b.date) || new Date().toISOString().slice(0, 10)
  db.prepare(`UPDATE entries SET deposit_back = ?, deposit_back_method = ?, deposit_back_at = ?
    ${isDeposit ? ", settled_at = ?, settled_method = 'refund', refunded = ?" : ''}, updated_at = datetime('now') WHERE id = ?`)
    .run(...(isDeposit ? [back, method, date, date, back, entry.id] : [back, method, date, entry.id]))
  return { ok: true, back, kept: Math.round((held - back) * 100) / 100, method }
})
