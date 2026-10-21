// Telefonens ventende poster (udbakken) regnet med i turen, så appen kan bruges offline: de står
// i listen og tæller med i forbrug, kontanter, hotelregning, kategorier og fordeling. Det er den
// samme beregning som serverens (shared/utils/ledger.ts); når posterne er sendt, overtager
// serverens tal. Markedskursen skønnes ud fra turens seneste post i samme valuta.
import type { OutboxItem } from './outbox'

// Som serverens defaultSplit (server/utils/entry.ts): turens standardfordeling for en ny udgift.
function defaultSplit(project: any, participants: any[]) {
  if (!project.default_split || !participants.length) return null
  if (project.default_split === 'equal') return { mode: 'equal', pids: participants.map(p => p.id) }
  const shares: Record<string, number> = {}
  for (const p of participants) if (p.weight > 0) shares[p.id] = p.weight
  return Object.keys(shares).length ? { mode: 'weights', shares } : null
}

const numOrNull = (v: any) => v == null || v === '' ? null : parseAmount(v)

// En ventende post, som serveren ville gemme den (negativt id = findes kun på telefonen).
function pendingEntry(item: OutboxItem, n: number, d: any) {
  const b: any = item.type === 'photo' ? { ...item.fields } : item.body || {}
  const kind = item.type === 'photo' ? 'expense' : b.kind || 'expense'
  const pay = item.type === 'entry' && item.payment ? item.payment : null
  return {
    id: -n, pending: item.id, photo: item.type === 'photo', status: 'pending',
    kind, method: kind === 'withdrawal' ? 'cash' : b.method || 'card',
    occurred_at: b.occurred_at || localDate(), currency: b.currency || d.project.currency,
    amount: numOrNull(b.amount), tip: kind === 'expense' ? parseAmount(b.tip) : 0, tip_cash: b.tip_cash ? 1 : 0, service: 0,
    base_amount: numOrNull(b.base_amount), description: b.description || null, merchant: null, category: b.category || null,
    paid_by: b.paid_by ?? null, split: 'split' in b ? b.split : isSpend(kind) ? defaultSplit(d.project, d.participants) : null,
    stay_id: b.stay_id ?? null, deposit: 0, settled_at: null, refunded: 0,
    attachments: [], payments: pay ? [pay] : [], paid: pay ? parseAmount(pay.amount) : 0,
  }
}

// Seneste kendte markedskurs for valutaen (posterne er nyeste først).
function guessRate(entries: any[], currency: string, base: string) {
  if (currency === base) return 1
  return entries.find(e => e.currency === currency && e.rate_source === 'market' && e.rate)?.rate
    ?? entries.find(e => e.currency === currency && e.rate)?.rate ?? null
}

export function withPending(d: any, items: OutboxItem[]) {
  if (!d?.entries || !items.length) return d
  const fresh = items.filter(x => x.type === 'entry' || x.type === 'photo').map((x, i) => pendingEntry(x, i + 1, d))
  // Betalinger, der venter: til en ventende post, eller til en post, serveren allerede har.
  const pays = [
    ...fresh.flatMap(e => e.payments.map((p: any) => ({ ...p, entry_id: e.id, currency: e.currency }))),
    ...items.filter(x => x.type === 'payment' && x.payment).map(x => ({ ...x.payment, entry_id: x.entryId })),
  ].map(p => ({ ...p, amount: parseAmount(p.amount), currency: p.currency || d.entries.find((e: any) => e.id === p.entry_id)?.currency }))
  if (!fresh.length && !pays.length) return d

  const base = d.project.base_currency
  // En ventende hævning kan ændre kontantkursen — så skal kontantposterne regnes om.
  const cashRate = cashRates([...fresh, ...d.entries])
  const rerate = (e: any) => {
    const known = knownRate(e, cashRate)
    const rate = known ? known.rate : e.pending ? guessRate(d.entries, e.currency, base) : e.rate
    return enrichEntry(e, rate, known?.source || 'market', d.stays)
  }
  const entries = [...fresh, ...d.entries].map((e: any) => {
    const extra = pays.filter(p => p.entry_id === e.id && !e.pending)
    const paid = extra.length ? { payments: [...e.payments, ...extra], paid: e.paid + extra.reduce((s, p) => s + p.amount, 0) } : {}
    const changed = e.pending || (e.rate_source === 'cash' && cashRate[e.currency] !== e.rate)
    return { ...(changed ? rerate(e) : e), ...paid }
  }).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

  return {
    ...d, entries,
    summary: summarize({ project: d.project, participants: d.participants, entries, pays: [...(d.pays || []), ...pays], stays: d.stays, cashRate }),
  }
}
