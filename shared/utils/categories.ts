// Faste kategorier for udgifter. Delt mellem app og server (Nuxt shared/).
// Claude vælger blandt nøglerne ved aflæsning/indtastning; brugeren kan rette.
export const CATEGORIES = [
  { key: 'mad', label: 'Mad & drikke', icon: 'i-lucide-utensils', hint: 'restaurant, café, bar, snacks, smoothies, dagligvarer til at spise' },
  { key: 'ture', label: 'Ture & udflugter', icon: 'i-lucide-ship', hint: 'guidede ture, bådture, dagsture, nationalparkgebyrer, entré til seværdigheder' },
  { key: 'hotel', label: 'Hotel & ophold', icon: 'i-lucide-bed-double', hint: 'overnatning, værelse, resort-gebyrer, minibar, vasketøj på hotellet' },
  { key: 'forlystelse', label: 'Forlystelser & aktiviteter', icon: 'i-lucide-ferris-wheel', hint: 'forlystelsespark, vandland, dykning, kajak, legeland, shows' },
  { key: 'transport', label: 'Transport', icon: 'i-lucide-car-taxi-front', hint: 'taxi, Grab, færge, tuk-tuk, leje af scooter/bil, benzin, fly, tog' },
  { key: 'indkob', label: 'Indkøb & souvenirs', icon: 'i-lucide-shopping-bag', hint: 'tøj, souvenirs, apotek, solcreme, butikker, marked (ikke mad)' },
  { key: 'velvaere', label: 'Massage & velvære', icon: 'i-lucide-flower-2', hint: 'massage, spa, frisør, negle' },
  { key: 'andet', label: 'Andet', icon: 'i-lucide-circle-ellipsis', hint: 'alt der ikke passer i de andre' },
] as const

export type CategoryKey = typeof CATEGORIES[number]['key']
export const CATEGORY_KEYS = CATEGORIES.map(c => c.key) as string[]
export const categoryOf = (key?: string | null) => CATEGORIES.find(c => c.key === key)
