export default defineEventHandler(async (event) => {
  const { entry } = await requireEntry(event, intParam(event, 'id'))
  const b = (await readBody<any>(event)) || {}
  const u = entryPatch(b, participantIds(entry.project_id))
  // Hotel: valgt hotel, eller null = foreslå ud fra datoen.
  const stays = loadStays(entry.project_id)
  if ('stay_id' in b) u.stay_id = stays.find(s => s.id === Number(b.stay_id))?.id ?? null
  // Udgift uden "heraf depositum" = intet at afstemme. (En depositum-post afstemmes med de
  // samme felter, så de må ikke ryddes her.)
  if ('deposit' in u && !u.deposit && (u.kind ?? entry.kind) === 'expense') Object.assign(u, { deposit_back: null, deposit_back_method: null, deposit_back_at: null })
  const keys = Object.keys(u)
  if (keys.length) useDb().prepare(`UPDATE entries SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map(k => u[k]), entry.id)
  // Ny tekst på en ukategoriseret udgift: lad Claude foreslå en kategori.
  const after = useDb().prepare('SELECT kind, category, status FROM entries WHERE id = ?').get(entry.id) as any
  if (isSpend(after?.kind) && !after.category && after.status === 'ready' && ('merchant' in u || 'description' in u)) queueCategorize(entry.id)
  return { ok: true }
})
