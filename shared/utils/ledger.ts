// Regner en tur igennem: grundbeløb pr. post, fordeling pr. deltager og overblikket.
// Delt mellem server (server/utils/ledger.ts, ud fra databasen) og app (app/composables/
// pending.ts, der regner telefonens ventende poster med offline). Ren beregning — kurserne
// findes af den, der kalder.
export type Split = { mode: 'equal', pids: number[] } | { mode: 'weights', shares: Record<string, number> }
export type Stay = { id: number, name: string, check_in: string, check_out: string | null, settled_at: string | null }

export function parseSplit(raw: any): Split | null {
  if (!raw) return null
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return null }
}

// Andele (summen 1) pr. deltager-id for en post.
export function shareFractions(split: Split | null): Record<number, number> {
  const out: Record<number, number> = {}
  if (!split) return out
  if (split.mode === 'equal') {
    const ids = split.pids || []
    for (const id of ids) out[id] = 1 / ids.length
  } else {
    const entries = Object.entries(split.shares || {}).filter(([, w]) => Number(w) > 0)
    const sum = entries.reduce((s, [, w]) => s + Number(w), 0)
    for (const [id, w] of entries) out[Number(id)] = Number(w) / sum
  }
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Er posten (ved afregning) betalt med kontanter? Så bruges kontantkursen.
export const paidInCash = (e: any) => e.method === 'cash' || (e.kind === 'deposit' && e.method === 'cash') || (e.method === 'room' && e.settled_method === 'cash')

// Hvilket hotel hører en regningspost (eller et depositum) til?
// Et valgt stay_id vinder. Ellers foreslås det ud fra datoen: opholdet, der dækker
// datoen (check-in til og med check-ud). Skiftedag (to ophold dækker datoen): det
// hotel, man forlader, indtil dets regning er betalt — derefter det nye.
export function stayFor(e: { stay_id?: number | null, occurred_at: string }, stays: Stay[]): number | null {
  if (e.stay_id && stays.some(s => s.id === e.stay_id)) return e.stay_id
  const hits = stays.filter(s => s.check_in <= e.occurred_at && (!s.check_out || e.occurred_at <= s.check_out))
  if (!hits.length) return null
  return (hits.find(s => !s.settled_at) || hits[hits.length - 1]!).id
}

// Hører posten på en hotelregning? (Udgifter/rabatter skrevet på værelset og depositum.)
export const onHotel = (e: { kind: string, method: string }) => (isSpend(e.kind) && e.method === 'room') || e.kind === 'deposit'

// Kontantkurs pr. valuta = hvad hævningerne reelt kostede (inkl. gebyrer).
export function cashRates(rows: any[]) {
  const wd: Record<string, { amt: number, base: number }> = {}
  for (const e of rows) {
    if (e.kind === 'withdrawal' && e.amount > 0 && e.base_amount > 0) {
      wd[e.currency] ||= { amt: 0, base: 0 }
      wd[e.currency]!.amt += Number(e.amount)
      wd[e.currency]!.base += Number(e.base_amount)
    }
  }
  return Object.fromEntries(Object.entries(wd).map(([c, v]) => [c, v.base / v.amt])) as Record<string, number>
}

// Kursen for en post, hvis den er givet: fast (base_amount) eller kontantkurs for kontantposter.
// null = markedskurs, som serveren slår op (ECB), og appen skønner ud fra turens poster.
export function knownRate(e: any, cash: Record<string, number>): { rate: number, source: 'fixed' | 'cash' } | null {
  if (e.base_amount != null && e.base_amount !== '' && Number(e.amount)) return { rate: Number(e.base_amount) / Number(e.amount), source: 'fixed' }
  if (paidInCash(e) && cash[e.currency]) return { rate: cash[e.currency]!, source: 'cash' }
  return null
}

// Depositum, der skal afstemmes: hele en depositum-post, eller "heraf depositum" på en udgift.
// Afstemt: det retur-beløb (kort/kontant) er ikke forbrug, resten er modregnet og er. Et
// hoteldepositum, der er modregnet i regningen (settled_method 'applied'), er ikke selv forbrug —
// det er regningens poster. Ældre "fået tilbage" uden retur-felter = det hele, samme vej som betalt.
export function depositOf(e: any) {
  const held = e.kind === 'deposit' ? Number(e.amount) || 0 : e.kind === 'expense' ? Number(e.deposit) || 0 : 0
  if (!(held > 0)) return null
  const applied = e.kind === 'deposit' && e.settled_method === 'applied'
  const closed = e.kind === 'deposit' ? !!e.settled_at : !!e.deposit_back_at
  const back = !closed || applied ? 0 : Number(e.deposit_back ?? e.refunded) || 0
  const method = e.deposit_back_method || (e.method === 'cash' ? 'cash' : 'card')
  return { held, closed, applied, back, method, kept: closed && !applied ? round2(held - back) : 0 }
}

// Grundbeløb og afledte felter for én post, givet kursen.
export function enrichEntry(e: any, rate: number | null, rateSource: string, stays: Stay[]) {
  const amount = Number(e.amount) || 0
  // Forbrug: uden det depositum, der kom (eller kommer) retur. En depositum-post er kun
  // forbrug med det, der blev modregnet.
  const dep = depositOf(e)
  const cost = dep ? (e.kind === 'deposit' ? dep.kept : round2(amount - dep.held + dep.kept)) : amount
  return {
    ...e,
    split: parseSplit(e.split),
    // Hotel: valgt (stay_id) eller foreslået ud fra datoen.
    stay: onHotel(e) ? stayFor(e, stays) : null,
    rate,
    rate_source: rateSource,
    base_value: rate != null ? round2(amount * rate) : null,
    dep,
    cost,
    base_cost: rate != null ? round2(cost * rate) : null,
    base_tip: rate != null ? round2((Number(e.tip) || 0) * rate) : null,
    base_service: rate != null ? round2((Number(e.service) || 0) * rate) : null,
  }
}

// Overblikket for en tur ud fra færdigberegnede poster (enrichEntry + payments/paid).
export function summarize(o: { project: any, participants: any[], entries: any[], pays: any[], stays: Stay[], cashRate: Record<string, number> }) {
  const { participants, entries, pays, stays } = o
  const per: Record<number, { share: number, paid: number }> = {}
  for (const p of participants) per[p.id] = { share: 0, paid: 0 }
  let spent = 0, income = 0, tips = 0, service = 0, unsplit = 0, unconverted = 0, reading = 0
  const byCurrency: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  // Kontanter pr. valuta: hævet − brugt. "Brugt" er kontantposter, kontant-tip på
  // kort/regning, og hotelregninger der er betalt kontant.
  const cashIn: Record<string, number> = {}
  const cashOut: Record<string, number> = {}
  // Åbne hotelregninger pr. hotel og valuta (hotel null = poster uden for et registreret ophold).
  const tab: { stay: number | null, name: string | null, currency: string, amount: number, count: number, deposit: number, ids: number[] }[] = []
  const tabFor = (stay: number | null, currency: string) => {
    let t = tab.find(x => x.stay === stay && x.currency === currency)
    if (!t) tab.push(t = { stay, name: stays.find(x => x.id === stay)?.name || null, currency, amount: 0, count: 0, deposit: 0, ids: [] })
    return t
  }
  const deposits: Record<string, { amount: number, cash: number, card: number, count: number }> = {}
  const due: { id: number, title: string, currency: string, amount: number, paid: number, remaining: number }[] = []
  const depositsOpen: any[] = []
  const addTo = (o: Record<string, number>, c: string, v: number) => { o[c] = (o[c] || 0) + v }
  for (const e of entries) {
    if (e.status === 'reading') reading++
    const amt = Number(e.amount) || 0
    const cashTip = e.method !== 'cash' && e.tip_cash ? Number(e.tip) || 0 : 0
    const sign = spendSign(e.kind)
    if (e.kind === 'withdrawal') { addTo(cashIn, e.currency, amt); continue }
    // Depositum er ikke forbrug: kontant er ude af pungen indtil det kommer retur;
    // på kort er det kun en reservation. Står åbent ("husk at afstemme") indtil afstemt
    // eller modregnet i hotelregningen. Kontant retur lægges i pungen.
    const dep = e.dep
    if (dep) {
      if (!dep.closed) {
        if (e.kind === 'deposit') depositsOpen.push(e)
        const d = deposits[e.currency] ||= { amount: 0, cash: 0, card: 0, count: 0 }
        d.amount += dep.held; d.count++; e.method === 'cash' ? (d.cash += dep.held) : (d.card += dep.held)
      } else if (dep.back && dep.method === 'cash') addTo(cashIn, e.currency, dep.back)
    }
    if (e.kind === 'deposit') {
      // Modregnet i hotelregningen: et overskud er kommet retur (refunded).
      if (e.method === 'cash') addTo(cashOut, e.currency, amt - (dep?.applied ? Number(e.refunded) || 0 : 0))
      if (!(e.cost > 0)) continue
    }
    else if (e.kind === 'income') { if (e.method === 'cash') addTo(cashIn, e.currency, amt) }
    // Rabat i kontanter (penge tilbage) lægges i pungen.
    else if (e.method === 'cash') addTo(e.kind === 'credit' ? cashIn : cashOut, e.currency, amt)
    else {
      if (cashTip) addTo(cashOut, e.currency, cashTip)
      if (e.method === 'room' && !e.settled_at) { const t = tabFor(e.stay, e.currency); t.amount += sign * (amt - cashTip); t.count++; t.ids.push(e.id) }
      // Betales senere/delvist: det udestående er beløbet minus registrerede betalinger
      // (og minus drikkepenge, der allerede er givet kontant).
      if (e.method === 'later' && e.kind === 'expense') {
        const remaining = round2(amt - cashTip - e.paid)
        if (remaining > 0.004) due.push({ id: e.id, title: e.merchant || e.description || 'Udgift', currency: e.currency, amount: amt, paid: e.paid, remaining })
      }
    }
    if (e.kind === 'income') { income += e.base_value || 0; continue }
    byCurrency[e.currency] = (byCurrency[e.currency] || 0) + sign * e.cost
    if (e.base_cost == null) { if (e.cost) unconverted++; continue }
    const v = sign * e.base_cost
    spent += v
    byCategory[e.category || 'none'] = (byCategory[e.category || 'none'] || 0) + v
    if (e.kind === 'expense') { tips += e.base_tip || 0; service += e.base_service || 0 }
    if (e.paid_by && per[e.paid_by]) per[e.paid_by]!.paid += v
    const fr = shareFractions(e.split)
    if (!Object.keys(fr).length) { unsplit += v; continue }
    for (const [pid, f] of Object.entries(fr)) if (per[Number(pid)]) per[Number(pid)]!.share += v * f
  }

  // Depositum der kan modregnes i en regning: samme hotel, eller uden hotel.
  for (const t of tab) {
    t.amount = round2(t.amount)
    t.deposit = round2(depositsOpen.filter(d => d.currency === t.currency && (d.stay === t.stay || d.stay == null)).reduce((s, d) => s + (Number(d.amount) || 0), 0))
  }
  tab.sort((a, b) => (stays.findIndex(x => x.id === a.stay) - stays.findIndex(x => x.id === b.stay)))

  // Betalinger (delbetalinger og rest af hotelregning) — kontante trækkes fra pungen.
  for (const p of pays) if (p.method === 'cash') addTo(cashOut, p.currency, Number(p.amount) || 0)

  return {
    base: o.project.base_currency, spent: round2(spent), income: round2(income), tips: round2(tips), service: round2(service), unsplit: round2(unsplit),
    unconverted, reading, byCurrency,
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round2(v)]).sort((a, b) => b[1] - a[1])), cashRate: o.cashRate, tab, deposits, due,
    cash: Object.fromEntries([...new Set([...Object.keys(cashIn), ...Object.keys(cashOut)])].map(c => [c, round2((cashIn[c] || 0) - (cashOut[c] || 0))])),
    cashIn, cashOut,
    perParticipant: participants.map(p => ({
      id: p.id, name: p.name, share: round2(per[p.id]!.share), paid: round2(per[p.id]!.paid),
      balance: round2(per[p.id]!.paid - per[p.id]!.share),
    })),
  }
}
