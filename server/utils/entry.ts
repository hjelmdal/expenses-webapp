// Fælles validering af post-felter (oprettelse og redigering).
const KINDS = ['expense', 'income', 'withdrawal']

export function entryPatch(b: Record<string, any>, participantIds: number[]) {
  const u: Record<string, any> = {}
  if ('kind' in b && KINDS.includes(b.kind)) u.kind = b.kind
  if ('occurred_at' in b && normDate(b.occurred_at)) u.occurred_at = normDate(b.occurred_at)
  if ('merchant' in b) u.merchant = String(b.merchant ?? '').trim().slice(0, 200) || null
  if ('description' in b) u.description = String(b.description ?? '').trim().slice(0, 500) || null
  if ('amount' in b) u.amount = numOrNull(b.amount)
  if ('tip' in b) u.tip = numOrNull(b.tip) || 0
  if ('currency' in b && normCurrency(b.currency)) u.currency = normCurrency(b.currency)
  if ('base_amount' in b) u.base_amount = numOrNull(b.base_amount)
  if ('method' in b && ['card', 'cash'].includes(b.method)) u.method = b.method
  if ('paid_by' in b) u.paid_by = participantIds.includes(Number(b.paid_by)) ? Number(b.paid_by) : null
  if ('split' in b) {
    let s = b.split
    if (typeof s === 'string') { try { s = JSON.parse(s) } catch { s = null } }
    if (s?.mode === 'equal') {
      const pids = (s.pids || []).map(Number).filter((id: number) => participantIds.includes(id))
      u.split = pids.length ? JSON.stringify({ mode: 'equal', pids }) : null
    } else if (s?.mode === 'weights') {
      const shares: Record<string, number> = {}
      for (const [k, v] of Object.entries(s.shares || {})) if (participantIds.includes(Number(k)) && Number(v) > 0) shares[k] = Number(v)
      u.split = Object.keys(shares).length ? JSON.stringify({ mode: 'weights', shares }) : null
    } else u.split = null
  }
  if (u.kind === 'withdrawal') u.method = 'cash'
  return u
}

export function participantIds(projectId: number) {
  return (useDb().prepare('SELECT id FROM participants WHERE project_id = ?').all(projectId) as any[]).map(r => r.id)
}
