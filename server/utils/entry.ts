// Fælles validering af post-felter (oprettelse og redigering).
const KINDS = ['expense', 'credit', 'income', 'withdrawal', 'deposit']

export function entryPatch(b: Record<string, any>, participantIds: number[]) {
  const u: Record<string, any> = {}
  if ('kind' in b && KINDS.includes(b.kind)) u.kind = b.kind
  if ('occurred_at' in b && normDate(b.occurred_at)) u.occurred_at = normDate(b.occurred_at)
  if ('merchant' in b) u.merchant = String(b.merchant ?? '').trim().slice(0, 200) || null
  if ('description' in b) u.description = String(b.description ?? '').trim().slice(0, 500) || null
  if ('amount' in b) u.amount = numOrNull(b.amount)
  if ('tip' in b) u.tip = numOrNull(b.tip) || 0
  if ('service' in b) u.service = numOrNull(b.service) || 0
  if ('category' in b) u.category = CATEGORY_KEYS.includes(b.category) ? b.category : null
  if ('currency' in b && normCurrency(b.currency)) u.currency = normCurrency(b.currency)
  if ('base_amount' in b) u.base_amount = numOrNull(b.base_amount)
  if ('method' in b && ['card', 'cash', 'room', 'later'].includes(b.method)) u.method = b.method
  if ('tip_cash' in b) u.tip_cash = b.tip_cash === true || b.tip_cash === 1 || b.tip_cash === '1' || b.tip_cash === 'true' ? 1 : 0
  // Kun genåbning herfra — afregning sker samlet via /settle.
  if (b.settled === false) { u.settled_at = null; u.settled_method = null; u.refunded = 0 }
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
  if (u.kind === 'withdrawal') { u.method = 'cash'; u.tip_cash = 0 }
  // Depositum betales med kort (reservation) eller kontant — ikke på regning/senere.
  if (u.kind === 'deposit' && u.method && !['card', 'cash'].includes(u.method)) u.method = 'card'
  // Regning: udgifter og rabatter (credit på hotelregningen). Delvist: kun udgifter.
  if (u.kind && !isSpend(u.kind) && ['room', 'later'].includes(u.method)) u.method = 'card'
  if (u.kind === 'credit' && u.method === 'later') u.method = 'card'
  if (u.kind === 'credit') { u.tip = 0; u.tip_cash = 0; u.service = 0 }
  // amount er inkl. tips — tips større end hele beløbet er en tastefejl (fx tips uden beløb).
  if ('amount' in u && 'tip' in u && u.tip > (u.amount ?? 0) + 0.004) {
    throw createError({ statusCode: 400, statusMessage: 'Drikkepenge kan ikke være større end beløbet i alt' })
  }
  if (u.method && !['room', 'later'].includes(u.method) && u.kind !== 'deposit') { u.settled_at = null; u.settled_method = null }
  return u
}

export function participantIds(projectId: number) {
  return (useDb().prepare('SELECT id FROM participants WHERE project_id = ?').all(projectId) as any[]).map(r => r.id)
}

// Standardfordeling for en ny udgift — et øjebliksbillede af deltagerne og deres vægte nu,
// så en senere ændring af vægtene ikke stille flytter gamle poster (det gøres med massefordeling).
export function defaultSplit(project: { id: number, default_split?: string | null }) {
  if (!project.default_split) return null
  const ps = useDb().prepare('SELECT id, weight FROM participants WHERE project_id = ? ORDER BY sort, id').all(project.id) as any[]
  if (!ps.length) return null
  if (project.default_split === 'equal') return JSON.stringify({ mode: 'equal', pids: ps.map(p => p.id) })
  const shares: Record<string, number> = {}
  for (const p of ps) if (p.weight > 0) shares[p.id] = p.weight
  return Object.keys(shares).length ? JSON.stringify({ mode: 'weights', shares }) : null
}
