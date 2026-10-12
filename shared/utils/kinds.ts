// Forbrugsposter: udgifter og rabatter/credits (en rabat er en negativ udgift — den trækker fra
// forbruget, fra kategorien og fra hver persons andel, og på regning fra hotelregningen).
export const SPEND_KINDS = ['expense', 'credit']
export const isSpend = (kind: string) => SPEND_KINDS.includes(kind)
export const spendSign = (kind: string) => (kind === 'credit' ? -1 : 1)
