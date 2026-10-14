<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const id = Number(route.params.id)
const { data, refresh, error } = await useAsyncData(`p-${id}`, () => api<any>(`/projects/${id}`))
const p = computed(() => data.value?.project)
const s = computed(() => data.value?.summary)

// "Start her": appen åbner på denne tur på denne enhed. Findes turen ikke (længere), glemmes
// valget, og man sendes til listen i stedet for at stå på en tom side.
const startHere = ref(false)
onMounted(() => { startHere.value = localStorage.getItem(START_TRIP_KEY) === String(id) })
function toggleStart() {
  startHere.value = !startHere.value
  startHere.value ? localStorage.setItem(START_TRIP_KEY, String(id)) : localStorage.removeItem(START_TRIP_KEY)
  toast.add({ title: startHere.value ? `Appen åbner nu på ${p.value.name}` : 'Appen åbner på turlisten', icon: startHere.value ? 'i-lucide-pin' : 'i-lucide-pin-off' })
}
watch(error, (e) => {
  if (!e) return
  if (localStorage.getItem(START_TRIP_KEY) === String(id)) localStorage.removeItem(START_TRIP_KEY)
  navigateTo('/', { replace: true })
}, { immediate: true })

// Mens kvitteringer aflæses, hentes turen igen hvert 3. sekund.
let timer: any
watch(() => s.value?.reading, (n) => {
  clearInterval(timer)
  if (n) timer = setInterval(() => refresh(), 3000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

// --- Quick actions (swipe til venstre på en post). Sletning venter et øjeblik,
// så "Fortryd" kan nå at stoppe den — i stedet for en bekræftelsesdialog.
const NuxtLink = resolveComponent('NuxtLink')
const ROW_ACTIONS = [{ key: 'delete', icon: 'i-lucide-trash-2', label: 'Slet', color: 'error' as const }]
const hidden = ref(new Set<number>())
// Tryk på en kategori i fordelingen filtrerer listen.
const catFilter = ref<string | null>(null)
const catRows = computed(() => {
  const by = s.value?.byCategory || {}
  const total = Object.values(by).reduce((a: number, b: any) => a + b, 0) as number
  const max = Math.max(0, ...Object.values(by) as number[])
  return Object.entries(by).map(([key, v]: [string, any]) => {
    const c = categoryOf(key)
    return { key, label: c?.label || 'Ikke kategoriseret', icon: c?.icon || 'i-lucide-tag', value: v, pct: total ? Math.round(v / total * 100) : 0, w: max ? v / max * 100 : 0 }
  })
})
function rowAction(key: string, e: any) {
  if (key !== 'delete') return
  hidden.value = new Set([...hidden.value, e.id])
  let undone = false
  const timer = setTimeout(async () => {
    if (undone) return
    try { await api(`/entries/${e.id}`, { method: 'DELETE' }) } catch (err) { toast.add({ title: errMsg(err), color: 'error' }) }
    await refresh()
    hidden.value.delete(e.id)
  }, 5000)
  toast.add({
    title: `“${rowTitle(e)}” slettet`, duration: 5000, icon: 'i-lucide-trash-2',
    actions: [{ label: 'Fortryd', color: 'neutral', variant: 'outline', onClick: () => {
      undone = true; clearTimeout(timer)
      const s = new Set(hidden.value); s.delete(e.id); hidden.value = s
    } }],
  })
}

const days = computed(() => {
  const g: { day: string, items: any[], total: number }[] = []
  for (const e of (data.value?.entries || []).filter((x: any) => !hidden.value.has(x.id) && (!catFilter.value || (isSpend(x.kind) && (x.category || 'none') === catFilter.value)))) {
    let d = g.find(x => x.day === e.occurred_at)
    if (!d) g.push(d = { day: e.occurred_at, items: [], total: 0 })
    d.items.push(e)
    if (isSpend(e.kind)) d.total += spendSign(e.kind) * (e.base_value || 0)
  }
  return g
})

// --- Massefordeling: vælg flere udgifter (eller alle viste) og giv dem samme fordeling.
const selecting = ref(false)
const selected = ref(new Set<number>())
const visibleExpenses = computed(() => days.value.flatMap(d => d.items).filter((e: any) => isSpend(e.kind)))
function select(preset: 'all' | 'unsplit' | 'none') {
  const list = preset === 'all' ? visibleExpenses.value : preset === 'unsplit' ? visibleExpenses.value.filter((e: any) => !e.split) : []
  selected.value = new Set(list.map((e: any) => e.id))
}
function startSelect(preset: 'all' | 'unsplit' | 'none' = 'none') { selecting.value = true; select(preset) }
function stopSelect() { selecting.value = false; selected.value = new Set() }
function toggleSel(e: any) {
  if (!isSpend(e.kind)) return
  const s = new Set(selected.value)
  s.has(e.id) ? s.delete(e.id) : s.add(e.id)
  selected.value = s
}
// Fra indstillinger: /p/:id?select=unsplit åbner direkte i vælge-tilstand.
onMounted(() => {
  if (!route.query.select) return
  startSelect(route.query.select === 'all' ? 'all' : 'unsplit')
  navigateTo({ query: {} }, { replace: true })
})
const bulkOpen = ref(false)
const bulkSplit = ref<any>(null)
// Forslag i dialogen = turens standard (eller ligeligt mellem alle, hvis der ingen er).
function defaultSplit() {
  const ps = people.value
  if (p.value?.default_split === 'weights') return { mode: 'weights', shares: Object.fromEntries(ps.filter(x => x.weight > 0).map(x => [x.id, x.weight])) }
  return { mode: 'equal', pids: ps.map(x => x.id) }
}
function openBulk() { bulkSplit.value = defaultSplit(); bulkOpen.value = true }
const savingBulk = ref(false)
async function saveBulk() {
  savingBulk.value = true
  try {
    const r = await api<{ updated: number }>(`/projects/${id}/split`, { method: 'POST', body: { ids: [...selected.value], split: bulkSplit.value } })
    toast.add({ title: `${r.updated} post${r.updated === 1 ? '' : 'er'} ${bulkSplit.value ? 'fordelt' : 'sat til “senere”'}`, color: 'success' })
    bulkOpen.value = false
    stopSelect()
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { savingBulk.value = false }
}

// --- Foto: ét tryk = ny post, gemt med det samme og aflæst i baggrunden.
const library = ref<HTMLInputElement>()
const addTo = ref<number | null>(null)   // post der skal have flere billeder
const uploading = ref(false)
const lastPhoto = ref<number | null>(null)

// Hvem lægger ud: huskes pr. tur på enheden, så den samme person ikke skal
// vælges igen for hver kvittering. Gælder både foto og hurtig indtastning.
const payerKey = `expenses-payer-${id}`
const payer = ref<number | null>(null)
onMounted(() => { const v = Number(localStorage.getItem(payerKey)); if (v) payer.value = v })
watch(payer, v => { v ? localStorage.setItem(payerKey, String(v)) : localStorage.removeItem(payerKey) })
const people = computed<any[]>(() => data.value?.participants || [])
watch(people, ps => { if (payer.value && !ps.some(x => x.id === payer.value)) payer.value = null })
const payerName = computed(() => people.value.find(x => x.id === payer.value)?.name)
const pickPayer = ref(false)

// Betalingsmåde for nye poster — huskes også (fx "Regning" så længe I bor på hotellet).
// Kvitteringsaflæsningen overskriver den kun, når kvitteringen tydeligt viser noget andet.
const methodKey = `expenses-method-${id}`
const defMethod = ref('card')
onMounted(() => { const v = localStorage.getItem(methodKey); if (v && ['card', 'cash', 'room'].includes(v)) defMethod.value = v })
watch(defMethod, v => localStorage.setItem(methodKey, v))
const METHOD_LABEL: Record<string, string> = { card: 'Kort', cash: 'Kontant', room: 'Regning' }

// Filvælgeren uden "capture": telefonen tilbyder selv kamera, fotos og filer.
function snap(target: number | null = null) {
  addTo.value = target
  library.value?.click()
}

// Billederne formindskes og gemmes i udbakken på telefonen, før de sendes. Først når
// serveren har svaret OK, slettes de lokalt — svigter nettet, sendes de igen automatisk.
const outbox = useOutbox()
async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  uploading.value = true
  const target = addTo.value
  try {
    const blobs = await Promise.all(files.map(f => shrinkImage(f)))
    input.value = ''
    if (target) {
      await outbox.add({ type: 'attach', projectId: id, entryId: target, files: blobs })
      toast.add({ title: 'Billede tilføjet — aflæser igen', color: 'success' })
    } else {
      const r = await outbox.add({ type: 'photo', projectId: id, files: blobs, fields: { occurred_at: localDate(), paid_by: payer.value, method: defMethod.value } })
      lastPhoto.value = r.id
      toast.add({ title: 'Gemt — aflæser kvitteringen…', color: 'success' })
    }
    await refresh()
  } catch (e: any) {
    toast.add(e?.queued ? QUEUED_TOAST : { title: errMsg(e), color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}
const QUEUED_TOAST = { title: 'Gemt på telefonen', description: 'Ingen forbindelse til serveren — sendes automatisk, så snart der er net.', color: 'warning' as const, icon: 'i-lucide-cloud-off' }
// Sendt fra udbakken (fx efter at nettet kom tilbage): vis de nye poster.
watch(outbox.sentCount, () => refresh())
const outboxPending = computed(() => outbox.pending.value.filter(x => x.projectId === id))
const outboxThumbs = ref<string[]>([])
watch(outboxPending, (items, _, onCleanup) => {
  const urls = items.flatMap(x => (x.files || []).slice(0, 1)).slice(0, 4).map(b => URL.createObjectURL(b))
  outboxThumbs.value = urls
  onCleanup(() => urls.forEach(u => URL.revokeObjectURL(u)))
}, { immediate: true })
const outboxLabel = (x: any) => x.type === 'entry' ? `${money(parseAmount(x.body?.amount), x.body?.currency || '')}${x.body?.description ? ` · ${x.body.description}` : ''}`
  : x.type === 'payment' ? 'Betaling' : x.type === 'attach' ? 'Ekstra billede' : 'Kvittering'
async function discardOutbox(x: any) {
  if (confirm('Slet den ventende post fra telefonen? Den er ikke sendt.')) await outbox.remove(x.id)
}

// --- Hotelregning: afregn alle åbne regningsposter på én gang
const settleOpen = ref(false)
const st = reactive<any>({ stay_id: null, name: '', currency: '', total: 0, deposit: 0, method: 'card', paid_by: null, base_amount: '', date: '', use_deposits: false })
const stDeposit = computed(() => st.deposit)
const stRemainder = computed(() => Math.max(0, st.total - (st.use_deposits ? stDeposit.value : 0)))
const stBack = computed(() => st.use_deposits ? Math.max(0, stDeposit.value - st.total) : 0)
// t = én åben regning (pr. hotel og valuta) fra summary.tab.
function openSettle(t: any) {
  Object.assign(st, { stay_id: t.stay, name: t.name || '', currency: t.currency, total: t.amount, deposit: t.deposit, method: 'card', paid_by: payer.value, base_amount: '', date: localDate(), use_deposits: false })
  billOpen.value = false
  settleOpen.value = true
}

// Regningen post for post — til at holde op mod hotellets udskrift ved check-ud.
const billOpen = ref(false)
// Regningen følges via hotel + valuta, så den opdateres, når en post rettes eller tilføjes.
const billKey = ref<{ stay: number | null, currency: string } | null>(null)
const bill = computed(() => s.value?.tab.find((t: any) => t.stay === billKey.value?.stay && t.currency === billKey.value?.currency))
const ticked = ref(new Set<number>())
const billRows = computed(() => (data.value?.entries || []).filter((e: any) => bill.value?.ids.includes(e.id))
  .sort((a: any, b: any) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id))
const onBill = (e: any) => spendSign(e.kind) * ((e.amount || 0) - (e.tip_cash ? e.tip || 0 : 0))
function openBill(t: any) {
  billKey.value = { stay: t.stay, currency: t.currency }
  Object.assign(nl, { description: '', amount: '', occurred_at: localDate() })
  hotelTotal.value = ''
  editing.value = null
  billOpen.value = true
}

// Justering ved check-ud: ret et beløb, tilføj en manglende post, eller bogfør forskellen.
const editing = ref<number | null>(null)
const editVal = ref('')
function editRow(r: any) { editing.value = r.id; editVal.value = String(Math.abs(onBill(r))) }
async function saveRow(r: any) {
  if (editing.value !== r.id) return
  editing.value = null
  const v = parseAmount(editVal.value)
  if (Math.abs(v - Math.abs(onBill(r))) < 0.005) return
  try {
    // Kontante drikkepenge står ikke på regningen, men er en del af postens beløb.
    await api(`/entries/${r.id}`, { method: 'PATCH', body: { amount: Math.round((v + (r.tip_cash ? r.tip || 0 : 0)) * 100) / 100 } })
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) }
}
const nl = reactive({ description: '', amount: '', occurred_at: '' })
// Negativt beløb = rabat/credit på regningen.
async function addBillLine(description: string, amount: number, date: string) {
  if (!bill.value || !amount) return
  try {
    await api(`/projects/${id}/entries`, { method: 'POST', body: {
      kind: amount < 0 ? 'credit' : 'expense', amount: Math.abs(amount), method: 'room', currency: bill.value.currency,
      description, occurred_at: date, stay_id: bill.value.stay, paid_by: payer.value,
    } })
    await refresh()
    return true
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) }
}
async function addMissing() {
  if (await addBillLine(nl.description.trim() || 'Post på hotelregningen', parseAmount(nl.amount), nl.occurred_at || localDate())) {
    Object.assign(nl, { description: '', amount: '' })
  }
}
const hotelTotal = ref('')
const billDiff = computed(() => bill.value && hotelTotal.value.trim() ? Math.round((parseAmount(hotelTotal.value) - bill.value.amount) * 100) / 100 : 0)
async function bookDiff() {
  if (await addBillLine('Difference på hotelregningen', billDiff.value, localDate())) hotelTotal.value = ''
}
function tick(eid: number) {
  const n = new Set(ticked.value)
  n.has(eid) ? n.delete(eid) : n.add(eid)
  ticked.value = n
}
const billTicked = computed(() => billRows.value.filter((e: any) => ticked.value.has(e.id)).length)
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`
async function settle() {
  try {
    const r = await api<any>(`/projects/${id}/settle`, { method: 'POST', body: st })
    settleOpen.value = false
    toast.add({
      title: `Regningen er betalt (${r.settled} poster)`,
      description: [r.applied ? `${money(r.applied, st.currency)} dækket af depositum` : '', r.refunded ? `${money(r.refunded, st.currency)} kommer retur` : ''].filter(Boolean).join(' · ') || undefined,
      color: 'success',
    })
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) }
}

// --- Depositum retur
const refundOpen = ref(false)
const refundCur = ref('')
const openDeposits = computed(() => (data.value?.entries || []).filter((e: any) => e.kind === 'deposit' && !e.settled_at && e.currency === refundCur.value))
function openRefund(c: string) { refundCur.value = c; refundOpen.value = true }
async function refundOne(e: any) {
  try {
    await api(`/entries/${e.id}/refund`, { method: 'POST', body: { date: localDate() } })
    toast.add({ title: e.method === 'cash' ? 'Depositum retur — lagt tilbage i pungen' : 'Depositum frigivet', color: 'success' })
    await refresh()
    if (!openDeposits.value.length) refundOpen.value = false
  } catch (err) { toast.add({ title: errMsg(err), color: 'error' }) }
}

// --- Betal rest på en "betales senere"-post
const payOpen = ref(false)
const pay = reactive<any>({ id: 0, title: '', currency: '', amount: '', method: 'cash', paid_by: null, date: '' })
function openPay(d: any) {
  Object.assign(pay, { id: d.id, title: d.title, currency: d.currency, amount: String(d.remaining), method: defMethod.value === 'cash' ? 'cash' : 'card', paid_by: payer.value, date: localDate() })
  payOpen.value = true
}
async function savePay() {
  try {
    await api(`/entries/${pay.id}/payments`, { method: 'POST', body: pay })
    payOpen.value = false
    toast.add({ title: 'Betaling registreret', color: 'success' })
    await refresh()
  } catch (err) { toast.add({ title: errMsg(err), color: 'error' }) }
}

// --- Optælling af kontanter
const countOpen = ref(false)
const ct = reactive({ currency: '', counted: '' })
const expectedCash = computed(() => s.value?.cash?.[ct.currency] || 0)
const countDiff = computed(() => ct.counted === '' ? null : expectedCash.value - Number(String(ct.counted).replace(',', '.')))
function openCount(currency: string) { Object.assign(ct, { currency, counted: '' }); countOpen.value = true }
async function count() {
  try {
    const r = await api<any>(`/projects/${id}/cash-count`, { method: 'POST', body: { ...ct, date: localDate() } })
    countOpen.value = false
    toast.add({ title: r.diff ? `Bogført forskel: ${money(Math.abs(r.diff), ct.currency)}` : 'Det passer præcis', color: 'success' })
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) }
}

// --- Hurtig indtastning
const quick = ref(false)
const q = reactive({ kind: 'expense', amount: '', currency: '', description: '', method: 'card', base_amount: '', occurred_at: '', tip: '', tip_cash: false, all_tip: false, paid_now: '', paid_method: 'card' })
const today = () => localDate()
const yesterday = () => localDate(new Date(Date.now() - 864e5))
function openQuick(kind = 'expense') {
  Object.assign(q, { kind, amount: '', currency: p.value.currency, description: '', method: kind === 'withdrawal' ? 'cash' : defMethod.value, base_amount: '', tip: '', tip_cash: false, all_tip: false, paid_now: '', paid_method: 'card',
    // Datoen huskes mellem poster i samme session — taster man gårsdagen ind, er det typisk flere.
    occurred_at: q.occurred_at || today() })
  quick.value = true
}
// Tips står oveni beløbet; serveren gemmer amount inkl. tips. "Det hele er drikkepenge": beløbet ER tipset.
function quickAmounts() {
  if (q.kind !== 'expense') return { amount: q.amount, tip: 0 }
  if (q.all_tip) return { amount: q.amount, tip: q.amount }
  return { amount: quickTotal.value, tip: q.tip }
}
const quickTotal = computed(() => Math.round((parseAmount(q.amount) + parseAmount(q.tip)) * 100) / 100)
const savingQuick = ref(false)
async function saveQuick() {
  savingQuick.value = true
  try {
    // Via udbakken: posten ligger på telefonen, til serveren har den.
    const body = { ...q, ...quickAmounts(), paid_by: q.kind === 'withdrawal' ? null : payer.value }
    const payment = q.kind === 'expense' && q.method === 'later' && parseAmount(q.paid_now) > 0
      ? { amount: q.paid_now, method: q.paid_method, paid_by: payer.value, date: q.occurred_at } : null
    try {
      await outbox.add({ type: 'entry', projectId: id, body, payment })
      quick.value = false
      await refresh()
    } catch (e: any) {
      // Ligger den i udbakken, kan formularen lukkes; ellers bliver den stående til rettelse.
      if (e?.queued) { quick.value = false; toast.add(QUEUED_TOAST) } else toast.add({ title: errMsg(e), color: 'error' })
    }
  } finally { savingQuick.value = false }
}

const base = computed(() => p.value?.base_currency || 'DKK')
// Farvekode i listen: ud (udgift) = rød, ind (indtægt) = grøn, hævning = blå (penge flyttes til pungen).
function flow(e: any) {
  if (e.kind === 'income') return { sign: '+', text: 'text-success' }
  if (e.kind === 'withdrawal') return { sign: '+', text: 'text-info' }
  if (e.kind === 'deposit') return { sign: '', text: 'text-warning' }
  if (e.kind === 'credit') return { sign: '+', text: 'text-success' }
  return { sign: '−', text: 'text-error' }
}
function rowTitle(e: any) {
  return e.merchant || e.description || (e.kind === 'withdrawal' ? 'Kontanthævning' : e.status === 'reading' ? 'Aflæser kvittering…' : KIND_LABEL[e.kind] || 'Udgift')
}
const rowIcon = (e: any) => categoryOf(e.category)?.icon || (e.kind === 'credit' ? 'i-lucide-badge-percent' : e.attachments.length ? 'i-lucide-receipt' : 'i-lucide-arrow-up-right')
const rowMeta = (e: any) => [
  isSpend(e.kind) ? categoryOf(e.category)?.label || '' : '',
  e.kind !== 'expense' ? KIND_LABEL[e.kind] : '',
  e.method === 'cash' && e.kind !== 'withdrawal' ? 'kontant' : '',
  e.method === 'room' ? [e.settled_at ? 'regning betalt' : 'på regning', (data.value?.stays || []).find((x: any) => x.id === e.stay)?.name].filter(Boolean).join(' · ') : '',
  e.kind === 'deposit' ? (!e.settled_at ? (e.method === 'cash' ? 'kontant · ude' : 'reserveret på kort') : e.settled_method === 'refund' ? 'fået tilbage' : 'modregnet') : '',
  e.method === 'later' && e.amount ? (laterRest(e) > 0.004 ? `rest ${money(laterRest(e), e.currency)}` : 'betalt') : '',
  tipText(e),
  splitShort(e),
].filter(Boolean).join(' · ')
// Rest på "betales senere": i alt minus kontant-tips (givet ved siden af) minus betalinger.
const laterRest = (e: any) => e.amount - (e.tip_cash ? e.tip || 0 : 0) - e.paid
// Beløbet med tips står til højre; her står regningen og tipsene hver for sig.
const tipText = (e: any) => {
  if (!e.tip || e.kind !== 'expense') return ''
  const cash = e.tip_cash && e.method !== 'cash' ? ' kontant' : ''
  const bill = (e.amount || 0) - e.tip
  return bill > 0.004 ? `${money(bill, e.currency)} + ${money(e.tip, e.currency)} drikkepenge${cash}` : `drikkepenge${cash}`
}
const splitShort = (e: any) => {
  if (!isSpend(e.kind)) return ''
  if (!e.split) return 'ikke fordelt'
  const ids = e.split.mode === 'equal' ? e.split.pids : Object.keys(e.split.shares)
  return `${ids.length} deler`
}
</script>

<template>
  <div v-if="p" class="mx-auto max-w-xl pb-44">
    <header class="sticky top-0 z-10 border-b border-default bg-default/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div class="flex items-center gap-2">
        <UButton to="/" icon="i-lucide-chevron-left" variant="ghost" color="neutral" square />
        <h1 class="flex-1 truncate text-lg font-semibold">{{ p.name }}</h1>
        <UButton icon="i-lucide-pin" :variant="startHere ? 'soft' : 'ghost'" :color="startHere ? 'primary' : 'neutral'" square
          :aria-label="startHere ? 'Appen starter her — tryk for at slå fra' : 'Start appen på denne tur'" :aria-pressed="startHere" @click="toggleStart" />
        <UButton v-if="!selecting" icon="i-lucide-list-checks" variant="ghost" color="neutral" square aria-label="Vælg poster" @click="startSelect()" />
        <UButton :to="`/p/${id}/settings`" icon="i-lucide-settings" variant="ghost" color="neutral" square />
      </div>
    </header>

    <!-- Udbakke: gemt på telefonen, ikke sendt endnu -->
    <div v-if="outboxPending.length" class="mx-4 mt-4 rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-cloud-off" class="size-4 shrink-0 text-warning" />
        <span class="flex-1 font-medium">{{ outboxPending.length }} venter på at blive sendt</span>
        <UButton size="xs" icon="i-lucide-refresh-cw" label="Send nu" @click="outbox.flush(true)" />
      </div>
      <p class="mt-1 text-xs text-muted">Gemt på telefonen og sendes automatisk, når der er forbindelse. Luk gerne appen — de bliver liggende.</p>
      <div v-if="outboxThumbs.length" class="mt-2 flex gap-2">
        <img v-for="u in outboxThumbs" :key="u" :src="u" class="h-14 w-10 rounded border border-default object-cover">
      </div>
      <div v-for="x in outboxPending" :key="x.id" class="mt-2 flex items-center gap-2 text-xs">
        <span class="min-w-0 flex-1 truncate">{{ outboxLabel(x) }}<span v-if="x.error" class="text-muted"> · {{ x.stuck ? 'afvist: ' : '' }}{{ x.error }}</span></span>
        <UButton size="xs" icon="i-lucide-trash-2" variant="ghost" color="neutral" square aria-label="Slet fra telefonen" @click="discardOutbox(x)" />
      </div>
    </div>

    <!-- Overblik -->
    <section class="space-y-3 p-4">
      <div class="rounded-2xl bg-teal-700 p-4 text-white">
        <div class="text-sm opacity-80">Brugt i alt</div>
        <div class="text-3xl font-semibold tabular-nums">{{ money(s.spent, base) }}</div>
        <div class="mt-1 flex flex-wrap gap-x-3 text-sm opacity-90">
          <span v-for="(v, c) in s.byCurrency" :key="c" class="tabular-nums">{{ money(v, String(c)) }}</span>
        </div>
      </div>
      <!-- Kontanter: hvor meget er der i pungen — tydeligt, lige under totalen -->
      <div v-for="(v, c) in s.cash" :key="c" class="rounded-2xl border border-default p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-wallet" class="size-4" /> Kontanter i pungen ca.</div>
            <div class="text-3xl font-semibold tabular-nums" :class="v < 0 ? 'text-error' : ''">{{ money(v, String(c)) }}</div>
            <div v-if="s.cashRate[c] && String(c) !== base" class="text-sm text-muted tabular-nums">≈ {{ money(v * s.cashRate[c], base) }}</div>
          </div>
          <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-calculator" label="Tæl op" @click="openCount(String(c))" />
        </div>
        <div v-if="s.cashIn[c]" class="mt-3 h-2 overflow-hidden rounded-full bg-error/20">
          <div class="h-full rounded-full bg-success transition-all" :style="{ width: `${Math.max(0, Math.min(100, v / s.cashIn[c] * 100))}%` }" />
        </div>
        <div class="mt-2 flex justify-between text-xs tabular-nums">
          <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-success" />Ind {{ money(s.cashIn[c] || 0, String(c)) }}</span>
          <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-error" />Ud {{ money(s.cashOut[c] || 0, String(c)) }}</span>
        </div>
        <div v-if="s.cashRate[c]" class="mt-1 text-xs text-muted">Kontantkurs {{ (s.cashRate[c] * 100).toFixed(2) }} {{ base }} pr. 100 {{ c }}</div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-xl border border-default p-3">
          <div class="text-muted">Drikkepenge</div>
          <div class="font-medium tabular-nums">{{ money(s.tips, base) }}</div>
          <div class="text-xs text-muted">vores valg</div>
        </div>
        <div class="rounded-xl border border-default p-3">
          <div class="text-muted">Service charge</div>
          <div class="font-medium tabular-nums">{{ money(s.service, base) }}</div>
          <div class="text-xs text-muted">stedets valg</div>
        </div>
        <button type="button" class="rounded-xl border border-default p-3 text-left" :disabled="!s.unsplit" @click="startSelect('unsplit')">
          <div class="text-muted">Ikke fordelt</div>
          <div class="font-medium tabular-nums">{{ money(s.unsplit, base) }}</div>
          <div v-if="s.unsplit" class="text-xs text-primary">Fordel nu</div>
        </button>
        <div v-if="s.income" class="rounded-xl border border-default p-3">
          <div class="text-muted">Indtægter</div>
          <div class="font-medium tabular-nums">{{ money(s.income, base) }}</div>
        </div>
        <div v-for="(d, c) in s.deposits" :key="'dep-' + c" class="col-span-2 rounded-xl border border-warning/40 p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-lock" class="size-4" /> Depositum ude</div>
              <div class="text-lg font-medium tabular-nums">{{ money(d.amount, String(c)) }}</div>
              <div class="text-xs text-muted">
                <span v-if="d.card">{{ money(d.card, String(c)) }} reserveret på kort</span><span v-if="d.card && d.cash"> · </span><span v-if="d.cash">{{ money(d.cash, String(c)) }} kontant</span>
                — ikke forbrug
              </div>
            </div>
            <UButton size="sm" variant="soft" color="neutral" label="Fået tilbage" @click="openRefund(String(c))" />
          </div>
        </div>
        <div v-if="s.due.length" class="col-span-2 rounded-xl border border-default p-3">
          <div class="mb-1 flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-clock" class="size-4" /> Mangler at betale</div>
          <div v-for="d in s.due" :key="d.id" class="flex items-center justify-between gap-2 py-1.5">
            <NuxtLink :to="`/p/${id}/e/${d.id}`" class="min-w-0">
              <div class="truncate font-medium">{{ d.title }}</div>
              <div class="text-xs text-muted tabular-nums">betalt {{ money(d.paid, d.currency) }} af {{ money(d.amount, d.currency) }}</div>
            </NuxtLink>
            <div class="flex items-center gap-2">
              <span class="font-medium tabular-nums">{{ money(d.remaining, d.currency) }}</span>
              <UButton size="sm" label="Betal" @click="openPay(d)" />
            </div>
          </div>
        </div>
        <div v-for="t in s.tab" :key="`tab-${t.stay}-${t.currency}`" class="col-span-2 cursor-pointer rounded-xl border border-warning/50 bg-warning/5 p-3"
          role="button" @click="openBill(t)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1 text-muted"><UIcon name="i-lucide-hotel" class="size-4 shrink-0" /><span class="truncate">{{ t.name || 'Åben hotelregning' }}</span></div>
              <div class="text-lg font-medium tabular-nums">{{ money(t.amount, t.currency) }}</div>
              <div class="text-xs text-muted">{{ t.count }} post{{ t.count === 1 ? '' : 'er' }} på regningen — tryk for at se dem</div>
            </div>
            <UButton size="sm" icon="i-lucide-check" label="Betal" @click.stop="openSettle(t)" />
          </div>
        </div>
      </div>
      <!-- Fordeling pr. kategori: én serie, én farve, navn + beløb direkte ved hver bjælke. -->
      <div v-if="catRows.length" class="rounded-xl border border-default p-3 text-sm">
        <div class="mb-2 font-medium">Kategorier</div>
        <button v-for="r in catRows" :key="r.key" type="button" class="block w-full rounded-lg px-1 py-1.5 text-left"
          :class="catFilter && catFilter !== r.key ? 'opacity-50' : ''" :aria-pressed="catFilter === r.key"
          :title="`${r.label}: ${money(r.value, base)} (${r.pct} %)`" @click="catFilter = catFilter === r.key ? null : r.key">
          <div class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-1.5"><UIcon :name="r.icon" class="size-4 shrink-0 text-muted" /><span class="truncate">{{ r.label }}</span></span>
            <span class="shrink-0 tabular-nums">{{ money(r.value, base) }} <span class="text-muted">· {{ r.pct }} %</span></span>
          </div>
          <!-- Kun rabatter i kategorien (netto negativ): ingen bjælke -->
          <div v-if="r.value > 0" class="mt-1 h-1.5 rounded-full bg-elevated">
            <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.max(r.w, 2)}%` }" />
          </div>
        </button>
      </div>

      <details v-if="s.perParticipant.some((x: any) => x.share || x.paid)" class="rounded-xl border border-default p-3 text-sm">
        <summary class="cursor-pointer font-medium">Fordeling pr. person</summary>
        <table class="mt-2 w-full tabular-nums">
          <thead class="text-muted"><tr><th class="text-left font-normal">Navn</th><th class="text-right font-normal">Andel</th><th class="text-right font-normal">Betalt</th><th class="text-right font-normal">Saldo</th></tr></thead>
          <tbody>
            <tr v-for="x in s.perParticipant" :key="x.id">
              <td>{{ x.name }}</td><td class="text-right">{{ money(x.share, base) }}</td>
              <td class="text-right">{{ money(x.paid, base) }}</td>
              <td class="text-right" :class="x.balance < 0 ? 'text-error' : x.balance > 0 ? 'text-success' : ''">{{ money(x.balance, base) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-muted">Saldo = betalt minus andel. Kun poster med “betalt af” og fordeling tæller med.</p>
      </details>
      <p v-if="s.unconverted" class="text-xs text-warning">{{ s.unconverted }} post(er) mangler kurs og er ikke talt med.</p>
    </section>

    <!-- Seneste foto: tilføj flere billeder til samme post -->
    <div v-if="lastPhoto" class="mx-4 mb-3 flex items-center justify-between rounded-xl bg-elevated p-3 text-sm">
      <span>Flere billeder til samme kvittering?</span>
      <div class="flex gap-1">
        <UButton size="sm" icon="i-lucide-camera" label="Tilføj" @click="snap(lastPhoto)" />
        <UButton size="sm" icon="i-lucide-x" variant="ghost" color="neutral" square @click="lastPhoto = null" />
      </div>
    </div>

    <!-- Poster -->
    <section class="px-4">
      <div v-if="catFilter" class="mb-3 flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-sm">
        <span>Viser: <b>{{ categoryOf(catFilter)?.label || 'Ikke kategoriseret' }}</b></span>
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" label="Vis alle" @click="catFilter = null" />
      </div>
      <div v-if="selecting" class="mb-3 flex items-center gap-1 rounded-lg bg-elevated px-2 py-1.5 text-sm">
        <span class="px-1 text-muted">Vælg:</span>
        <UButton size="xs" variant="soft" color="neutral" label="Alle" @click="select('all')" />
        <UButton size="xs" variant="soft" color="neutral" label="Ikke fordelte" @click="select('unsplit')" />
        <UButton size="xs" variant="ghost" color="neutral" label="Ingen" @click="select('none')" />
      </div>
      <div v-if="!days.length" class="rounded-xl border border-dashed border-default p-8 text-center text-muted">
        Tag et billede af første kvittering, eller indtast et beløb.
      </div>
      <div v-for="d in days" :key="d.day" class="mb-4">
        <div class="mb-1 flex justify-between px-1 text-xs font-medium uppercase tracking-wide text-muted">
          <span>{{ dayLabel(d.day) }}</span><span class="tabular-nums">{{ money(d.total, base) }}</span>
        </div>
        <div class="divide-y divide-default overflow-hidden rounded-xl border border-default">
          <SwipeRow v-for="e in d.items" :key="e.id" :actions="ROW_ACTIONS" :disabled="selecting" @action="k => rowAction(k, e)">
          <component :is="selecting ? 'button' : NuxtLink" v-bind="selecting ? { type: 'button', onClick: () => toggleSel(e) } : { to: `/p/${id}/e/${e.id}` }"
            draggable="false" class="flex w-full select-none items-center gap-3 p-3 text-left active:bg-elevated"
            :class="selecting && !isSpend(e.kind) ? 'opacity-40' : ''">
            <UIcon v-if="selecting" :name="selected.has(e.id) ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="size-6 shrink-0"
              :class="selected.has(e.id) ? 'text-primary' : 'text-dimmed'" />
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UIcon v-if="e.status === 'reading'" name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
              <UIcon v-else-if="e.status === 'failed'" name="i-lucide-triangle-alert" class="size-5 text-warning" />
              <UIcon v-else-if="e.kind === 'withdrawal'" name="i-lucide-banknote" class="size-5" />
              <UIcon v-else-if="e.kind === 'income'" name="i-lucide-arrow-down-left" class="size-5" />
              <UIcon v-else-if="e.kind === 'deposit'" name="i-lucide-lock" class="size-5" />
              <UIcon v-else :key="rowIcon(e)" :name="rowIcon(e)" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ rowTitle(e) }}</div>
              <div class="truncate text-xs text-muted">{{ rowMeta(e) }}</div>
            </div>
            <div class="text-right tabular-nums">
              <div class="font-medium" :class="flow(e).text">{{ e.amount != null ? flow(e).sign + money(e.amount, e.currency) : '—' }}</div>
              <div v-if="e.currency !== base && e.base_value != null" class="text-xs text-muted">{{ money(e.base_value, base) }}</div>
            </div>
          </component>
          </SwipeRow>
        </div>
      </div>
    </section>

    <UModal v-model:open="billOpen" :title="bill?.name ? `Regning · ${bill.name}` : 'Åben hotelregning'">
      <template #body>
        <div v-if="bill" class="space-y-3">
          <p class="text-sm text-muted">Hold posterne op mod hotellets udskrift, og kryds af. Beløb er inkl. drikkepenge skrevet på regningen.</p>
          <div class="divide-y divide-default rounded-lg border border-default">
            <div v-for="r in billRows" :key="r.id" class="flex items-center gap-2 px-3 py-2">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="tick(r.id)">
                <UIcon :name="ticked.has(r.id) ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="size-5 shrink-0" :class="ticked.has(r.id) ? 'text-primary' : 'text-muted'" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm" :class="ticked.has(r.id) ? 'text-muted' : 'font-medium'">{{ rowTitle(r) }}</div>
                  <div class="text-xs text-muted">{{ dm(r.occurred_at) }}<template v-if="r.tip"> · {{ r.tip_cash ? `${money(r.tip, r.currency)} drikkepenge givet kontant — ikke med` : `inkl. ${money(r.tip, r.currency)} drikkepenge` }}</template></div>
                </div>
              </button>
              <UInput v-if="editing === r.id" v-model="editVal" inputmode="decimal" size="sm" class="w-24" autofocus :ui="{ base: 'text-right tabular-nums' }"
                @keydown.enter.prevent="saveRow(r)" @blur="saveRow(r)" />
              <button v-else type="button" class="rounded-md px-1.5 py-1 text-sm tabular-nums underline decoration-dotted underline-offset-4"
                :class="r.kind === 'credit' ? 'text-success' : ''" :aria-label="`Ret beløb for ${rowTitle(r)}`" @click="editRow(r)">{{ money(onBill(r), r.currency) }}</button>
              <UButton :to="`/p/${id}/e/${r.id}`" icon="i-lucide-chevron-right" size="xs" variant="ghost" color="neutral" square aria-label="Åbn posten" />
            </div>
          </div>
          <p class="text-xs text-muted">Tryk på et beløb for at rette det. Hører en post ikke til her, så åbn den og vælg et andet hotel eller “Kort”.</p>
          <form class="flex items-center gap-2" @submit.prevent="addMissing">
            <UInput v-model="nl.description" placeholder="Manglende post" size="sm" class="min-w-0 flex-1" />
            <UInput v-model="nl.amount" inputmode="decimal" placeholder="Beløb" size="sm" class="w-24" :ui="{ base: 'text-right tabular-nums' }" />
            <UButton type="submit" icon="i-lucide-plus" size="sm" square aria-label="Tilføj post" :disabled="!parseAmount(nl.amount)" />
          </form>
          <p class="-mt-2 text-xs text-muted">Minus foran = rabat/credit på regningen.</p>
          <div class="space-y-1 text-sm tabular-nums">
            <div class="flex justify-between font-medium"><span>I alt</span><span>{{ money(bill.amount, bill.currency) }}</span></div>
            <div class="flex justify-between text-xs text-muted"><span>Krydset af</span><span>{{ billTicked }} af {{ billRows.length }}</span></div>
            <template v-if="bill.deposit">
              <div class="flex justify-between text-muted"><span>Depositum</span><span>−{{ money(bill.deposit, bill.currency) }}</span></div>
              <div v-if="bill.amount >= bill.deposit" class="flex justify-between font-medium"><span>Rest at betale</span><span>{{ money(bill.amount - bill.deposit, bill.currency) }}</span></div>
              <div v-else class="flex justify-between font-medium text-success"><span>Kommer retur</span><span>{{ money(bill.deposit - bill.amount, bill.currency) }}</span></div>
            </template>
          </div>
          <div class="rounded-lg bg-elevated p-3 text-sm">
            <UFormField label="Hotellets total" help="Skriv beløbet fra hotellets udskrift for at se forskellen">
              <UInput v-model="hotelTotal" inputmode="decimal" :placeholder="money(bill.amount, bill.currency)" class="w-full" :ui="{ base: 'tabular-nums' }" />
            </UFormField>
            <div v-if="hotelTotal.trim()" class="mt-2">
              <p v-if="Math.abs(billDiff) < 0.005" class="flex items-center gap-1 text-success"><UIcon name="i-lucide-check" class="size-4" /> Stemmer</p>
              <template v-else>
                <p class="tabular-nums">Forskel <b>{{ billDiff > 0 ? '+' : '−' }}{{ money(Math.abs(billDiff), bill.currency) }}</b>
                  <span class="text-muted"> — {{ billDiff > 0 ? 'hotellet har mere end os' : 'hotellet har mindre end os' }}</span></p>
                <p class="mt-1 text-xs text-muted">Find helst posten først. Kan den ikke findes, så bogfør forskellen, så regnskabet passer.</p>
                <UButton class="mt-2" size="sm" variant="soft" icon="i-lucide-scale" :label="`Bogfør forskellen (${billDiff > 0 ? '+' : '−'}${money(Math.abs(billDiff), bill.currency)})`" @click="bookDiff" />
              </template>
            </div>
          </div>
          <UButton block size="lg" icon="i-lucide-check" label="Betal regningen" @click="openSettle(bill)" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="settleOpen" :title="st.name ? `${st.name} er betalt` : 'Hotelregningen er betalt'">
      <template #body>
        <form class="space-y-4" @submit.prevent="settle">
          <p class="text-sm text-muted">Lukker alle åbne regningsposter ({{ money(st.total, st.currency) }}). Det bliver ikke en ny udgift — maden tæller allerede med.</p>
          <label v-if="stDeposit" class="flex items-start gap-2 rounded-lg bg-elevated p-3 text-sm">
            <USwitch v-model="st.use_deposits" class="mt-0.5" />
            <span>Modregn depositum ({{ money(stDeposit, st.currency) }})
              <span class="block text-xs text-muted">
                Rest at betale: <b class="tabular-nums">{{ money(stRemainder, st.currency) }}</b><template v-if="stBack"> · {{ money(stBack, st.currency) }} kommer retur</template>
              </span>
            </span>
          </label>
          <UFormField v-if="stRemainder > 0" :label="stDeposit && st.use_deposits ? 'Resten betalt med' : 'Betalt med'"><MethodPicker v-model="st.method" :room="false" /></UFormField>
          <UFormField v-if="people.length" label="Betalt af">
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="x in people" :key="x.id" type="button" size="sm" :variant="st.paid_by === x.id ? 'solid' : 'soft'" color="neutral"
                :label="x.name" @click="st.paid_by = st.paid_by === x.id ? null : x.id" />
            </div>
          </UFormField>
          <UFormField v-if="st.method === 'card' && stRemainder > 0" :label="`Trukket på kontoen (${base}) — valgfrit`" help="Giver posterne den reelle kurs inkl. gebyrer">
            <UInput v-model="st.base_amount" inputmode="decimal" class="w-full" />
          </UFormField>
          <UFormField label="Dato"><UInput v-model="st.date" type="date" class="w-full" /></UFormField>
          <UButton type="submit" block size="lg" label="Markér som betalt" />
        </form>
      </template>
    </UModal>

    <UModal v-model:open="refundOpen" title="Depositum retur">
      <template #body>
        <div class="space-y-2">
          <p class="text-sm text-muted">Tryk på det depositum, I har fået tilbage. Skal det i stedet bruges til at betale hotelregningen, så brug “Betal” på regningen og modregn det dér.</p>
          <div v-for="d in openDeposits" :key="d.id" class="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ rowTitle(d) }}</div>
              <div class="text-xs text-muted">{{ d.method === 'cash' ? 'kontant — lægges tilbage i pungen' : 'reserveret på kort — frigives' }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium tabular-nums">{{ money(d.amount, d.currency) }}</span>
              <UButton size="sm" icon="i-lucide-check" label="Retur" @click="refundOne(d)" />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="payOpen" :title="`Betal: ${pay.title}`">
      <template #body>
        <form class="space-y-4" @submit.prevent="savePay">
          <UFormField :label="`Beløb (${pay.currency})`"><UInput v-model="pay.amount" inputmode="decimal" size="xl" class="w-full" :ui="{ base: 'text-2xl tabular-nums' }" /></UFormField>
          <UFormField label="Betalt med"><MethodPicker v-model="pay.method" :room="false" /></UFormField>
          <UFormField v-if="people.length" label="Betalt af">
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="x in people" :key="x.id" type="button" size="sm" :variant="pay.paid_by === x.id ? 'solid' : 'soft'" color="neutral"
                :label="x.name" @click="pay.paid_by = pay.paid_by === x.id ? null : x.id" />
            </div>
          </UFormField>
          <UFormField label="Dato"><UInput v-model="pay.date" type="date" class="w-full" /></UFormField>
          <UButton type="submit" block size="lg" label="Registrér betaling" />
        </form>
      </template>
    </UModal>

    <UModal v-model:open="countOpen" title="Tæl kontanter op">
      <template #body>
        <form class="space-y-4" @submit.prevent="count">
          <p class="text-sm text-muted">Forventet ifølge appen: <span class="font-medium text-highlighted tabular-nums">{{ money(expectedCash, ct.currency) }}</span></p>
          <UFormField :label="`Optalt (${ct.currency})`">
            <UInput v-model="ct.counted" inputmode="decimal" size="xl" class="w-full" autofocus :ui="{ base: 'text-2xl tabular-nums' }" />
          </UFormField>
          <p v-if="countDiff != null && Math.abs(countDiff) >= 0.01" class="text-sm">
            <template v-if="countDiff > 0">{{ money(countDiff, ct.currency) }} er brugt uden at være registreret — bogføres som kontantforbrug.</template>
            <template v-else>{{ money(-countDiff, ct.currency) }} mere end forventet — bogføres som kontant-indtægt.</template>
          </p>
          <UButton type="submit" block size="lg" :disabled="ct.counted === ''" label="Ret saldo" />
        </form>
      </template>
    </UModal>

    <UModal v-model:open="bulkOpen" :title="`Fordel ${selected.size} post${selected.size === 1 ? '' : 'er'}`">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveBulk">
          <SplitEditor v-model="bulkSplit" :people="people" />
          <p class="text-xs text-muted">Erstatter fordelingen på de valgte poster.</p>
          <UButton type="submit" block size="lg" :loading="savingBulk" label="Gem fordeling" />
        </form>
      </template>
    </UModal>

    <!-- Inputbar -->
    <UModal v-model:open="pickPayer" title="Nye poster">
      <template #body>
        <div class="space-y-5">
          <div v-if="people.length">
            <div class="mb-2 text-sm font-medium">Lægges ud af</div>
            <div class="flex flex-wrap gap-2">
              <UButton v-for="x in people" :key="x.id" :variant="payer === x.id ? 'solid' : 'soft'" color="neutral"
                :label="x.name" @click="payer = payer === x.id ? null : x.id" />
            </div>
          </div>
          <div>
            <div class="mb-2 text-sm font-medium">Betales med</div>
            <MethodPicker v-model="defMethod" />
            <p class="mt-2 text-xs text-muted">Vælg “Regning”, så længe I skriver på værelset. Viser kvitteringen tydeligt noget andet (kortkvittering, udfyldt værelsesnr.), bruges det.</p>
          </div>
          <UButton block label="Færdig" @click="pickPayer = false" />
        </div>
      </template>
    </UModal>
    <input ref="library" type="file" accept="image/*" multiple class="hidden" @change="onFiles">
    <div v-if="selecting" class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div class="mx-auto flex max-w-xl gap-2">
        <UButton size="xl" class="flex-1 justify-center" icon="i-lucide-users" :disabled="!selected.size"
          :label="selected.size ? `Fordel ${selected.size} post${selected.size === 1 ? '' : 'er'}` : 'Vælg poster'" @click="openBulk" />
        <UButton size="xl" color="neutral" variant="soft" label="Annullér" @click="stopSelect" />
      </div>
    </div>
    <div v-else class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <button type="button" class="mx-auto mb-2 flex max-w-xl items-center gap-1 text-sm text-muted" @click="pickPayer = true">
        <template v-if="people.length">
          <UIcon name="i-lucide-user" class="size-4" />
          <span class="font-medium" :class="payerName ? 'text-highlighted' : ''">{{ payerName || 'Hvem lægger ud?' }}</span>
          <span class="mx-1">·</span>
        </template>
        <UIcon v-if="defMethod === 'room'" name="i-lucide-hotel" class="size-4" />
        <UIcon v-else-if="defMethod === 'cash'" name="i-lucide-banknote" class="size-4" />
        <UIcon v-else name="i-lucide-credit-card" class="size-4" />
        <span class="font-medium text-highlighted">{{ METHOD_LABEL[defMethod] }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-4" />
      </button>
      <div class="mx-auto flex max-w-xl gap-2">
        <UButton size="xl" class="flex-1 justify-center" icon="i-lucide-camera" :loading="uploading" label="Kvittering" @click="snap()" />
        <UButton size="xl" color="neutral" variant="soft" icon="i-lucide-keyboard" label="Manuel" @click="openQuick()" />
      </div>
    </div>

    <UModal v-model:open="quick" title="Ny post">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveQuick">
          <KindTabs v-model="q.kind" @change="k => { if (k === 'withdrawal') q.method = 'cash'; else if (!isSpend(k) && ['room', 'later'].includes(q.method) || k === 'credit' && q.method === 'later') q.method = 'card' }" />
          <div class="flex gap-2">
            <UInput v-model="q.amount" inputmode="decimal" placeholder="0" size="xl" class="flex-1" autofocus
              :ui="{ base: 'text-2xl tabular-nums' }" />
            <CurrencyPicker v-model="q.currency" :options="[p.currency, base]" />
          </div>
          <UFormField v-if="q.kind === 'withdrawal'" :label="`Trukket på kontoen (${base})`" help="Det banken trak — giver den reelle kontantkurs inkl. gebyrer">
            <UInput v-model="q.base_amount" inputmode="decimal" class="w-full" />
          </UFormField>
          <UInput v-model="q.description" placeholder="Hvad var det? (valgfrit)" class="w-full" />
          <div v-if="q.kind !== 'withdrawal' && people.length">
            <div class="mb-1 text-xs text-muted">{{ q.kind === 'expense' ? 'Lagt ud af' : 'Modtaget af' }}</div>
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="x in people" :key="x.id" type="button" size="sm" :variant="payer === x.id ? 'solid' : 'soft'" color="neutral"
                :label="x.name" @click="payer = payer === x.id ? null : x.id" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton type="button" size="sm" :variant="q.occurred_at === today() ? 'solid' : 'soft'" color="neutral" label="I dag" @click="q.occurred_at = today()" />
            <UButton type="button" size="sm" :variant="q.occurred_at === yesterday() ? 'solid' : 'soft'" color="neutral" label="I går" @click="q.occurred_at = yesterday()" />
            <UInput v-model="q.occurred_at" type="date" size="sm" class="flex-1" />
          </div>
          <MethodPicker v-if="q.kind !== 'withdrawal'" v-model="q.method" :room="isSpend(q.kind)" :later="q.kind === 'expense'" />
          <p v-if="q.kind === 'credit'" class="-mt-2 text-xs text-muted">Trækkes fra forbruget og fordeles som en udgift. Vælg “Regning”, hvis den er krediteret på hotelregningen.</p>
          <p v-if="q.kind === 'deposit'" class="-mt-2 text-xs text-muted">Tæller ikke som forbrug. Kort = reservation; kontant trækkes fra pungen, indtil det kommer retur.</p>
          <div v-if="q.kind === 'expense' && q.method === 'later'" class="rounded-lg bg-elevated p-3">
            <div class="mb-2 text-xs text-muted">Hele beløbet tæller som forbrug nu. Resten vises under “Mangler at betale”.</div>
            <div class="flex items-center gap-2">
              <UInput v-model="q.paid_now" inputmode="decimal" placeholder="Betalt nu (fx forudbetaling)" class="flex-1" />
              <MethodPicker v-model="q.paid_method" :room="false" size="sm" />
            </div>
          </div>
          <label v-if="q.kind === 'expense'" class="flex items-center gap-2 text-sm">
            <USwitch v-model="q.all_tip" />
            Det hele er drikkepenge
          </label>
          <TipInput v-if="q.kind === 'expense' && !q.all_tip" v-model:tip="q.tip" v-model:tip-cash="q.tip_cash" :method="q.method" :total="quickTotal" :currency="q.currency" />
          <UButton type="submit" block size="lg" :loading="savingQuick" :disabled="!q.amount && !(q.kind === 'expense' && parseAmount(q.tip))" label="Gem" />
        </form>
      </template>
    </UModal>
  </div>
</template>
