// Tekst om et depositums status (server/utils/ledger.ts → depositOf), til listen og posten.
export function depositText(e: any) {
  const d = e?.dep
  if (!d) return ''
  const m = (v: number) => money(v, e.currency)
  const how = d.method === 'cash' ? 'kontant' : 'på kort'
  const pre = e.kind === 'deposit' ? 'depositum' : `heraf ${m(d.held)} depositum`
  if (!d.closed) return `${pre} · ikke afstemt`
  if (d.applied) return 'modregnet i hotelregningen'
  if (!d.kept) return `${pre} retur ${how}`
  if (!d.back) return `${pre} beholdt (modregnet)`
  return `${pre}: ${m(d.back)} retur ${how}, ${m(d.kept)} modregnet`
}

// "15. okt." — til "Afstemt …".
export const shortDate = (iso?: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : ''
