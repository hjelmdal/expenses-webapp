export function normCurrency(v: any): string | null {
  const s = String(v || '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(s) ? s : null
}
export function normDate(v: any): string | null {
  const s = String(v || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}
export function numOrNull(v: any): number | null {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(',', '.'))
  return isFinite(n) ? n : null
}
