// Hvilket hotel hører en regningspost (eller et depositum) til?
// Et valgt stay_id vinder. Ellers foreslås det ud fra datoen: opholdet, der dækker
// datoen (check-in til og med check-ud). Skiftedag (to ophold dækker datoen): det
// hotel, man forlader, indtil dets regning er betalt — derefter det nye.
export type Stay = { id: number, name: string, check_in: string, check_out: string | null, settled_at: string | null }

export function loadStays(projectId: number) {
  return useDb().prepare('SELECT * FROM stays WHERE project_id = ? ORDER BY check_in, id').all(projectId) as Stay[]
}

export function stayFor(e: { stay_id?: number | null, occurred_at: string }, stays: Stay[]): number | null {
  if (e.stay_id && stays.some(s => s.id === e.stay_id)) return e.stay_id
  const hits = stays.filter(s => s.check_in <= e.occurred_at && (!s.check_out || e.occurred_at <= s.check_out))
  if (!hits.length) return null
  return (hits.find(s => !s.settled_at) || hits[hits.length - 1]!).id
}

// Hører posten på en hotelregning? (Udgifter/rabatter skrevet på værelset og depositum.)
export const onHotel = (e: { kind: string, method: string }) => (isSpend(e.kind) && e.method === 'room') || e.kind === 'deposit'
