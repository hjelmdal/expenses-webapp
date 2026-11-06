// Genåbn en betalt hotelregning (fx betalt med forkert beløb eller kurs): posterne bliver åbne
// igen og mister den kurs, betalingen gav dem; et modregnet depositum står ude igen, og
// betalingen slettes. Posterne beholder deres hotel (stay_id), så regningen kan betales igen.
export default defineEventHandler(async (event) => {
  const sid = intParam(event, 'sid')
  const db = useDb()
  const s = db.prepare('SELECT * FROM stays WHERE id = ?').get(sid) as any
  if (!s) throw createError({ statusCode: 404 })
  await requireProject(event, s.project_id)
  if (!s.settled_at) throw createError({ statusCode: 400, statusMessage: 'Regningen er ikke betalt' })
  db.exec('BEGIN')
  try {
    const posts = db.prepare(`UPDATE entries SET settled_at = NULL, settled_method = NULL, base_amount = NULL, updated_at = datetime('now')
      WHERE project_id = ? AND stay_id = ? AND method = 'room' AND kind IN ('expense', 'credit') AND settled_at IS NOT NULL`).run(s.project_id, sid).changes
    const deposits = db.prepare(`UPDATE entries SET settled_at = NULL, settled_method = NULL, refunded = 0, updated_at = datetime('now')
      WHERE project_id = ? AND stay_id = ? AND kind = 'deposit' AND settled_method = 'applied'`).run(s.project_id, sid).changes
    // Betalingen: knyttet til hotellet — eller, fra før payments.stay_id, genkendt på tekst og dato.
    const payments = db.prepare(`DELETE FROM payments WHERE project_id = ? AND entry_id IS NULL
      AND (stay_id = ? OR (stay_id IS NULL AND note LIKE 'Hotelregning%' AND occurred_at = ?))`).run(s.project_id, sid, s.settled_at).changes
    db.prepare('UPDATE stays SET settled_at = NULL WHERE id = ?').run(sid)
    db.exec('COMMIT')
    return { ok: true, posts, deposits, payments }
  } catch (e) { db.exec('ROLLBACK'); throw e }
})
