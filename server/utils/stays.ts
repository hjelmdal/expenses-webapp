// Hotelophold for en tur. Hvilket hotel en post hører til (stayFor/onHotel) står i
// shared/utils/ledger.ts, så appen kan regne det samme offline.
export function loadStays(projectId: number) {
  return useDb().prepare('SELECT * FROM stays WHERE project_id = ? ORDER BY check_in, id').all(projectId) as Stay[]
}
