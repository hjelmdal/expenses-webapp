<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const pid = Number(route.params.id)
const eid = Number(route.params.eid)
const { data, refresh } = await useAsyncData(`e-${eid}`, () => api<any>(`/entries/${eid}`))
const people = computed<any[]>(() => data.value?.participants || [])
const base = computed(() => data.value?.project.base_currency || 'DKK')

const f = reactive<any>({})
const split = ref<any>(null)

function load() {
  const e = data.value?.entry
  if (!e) return
  Object.assign(f, {
    kind: e.kind, occurred_at: e.occurred_at, merchant: e.merchant || '', description: e.description || '',
    // Tips står oveni: feltet "Beløb" er regningen uden tips; i databasen er amount inkl. tips.
    amount: e.amount == null ? '' : e.kind === 'expense' ? Math.round((e.amount - (e.tip || 0)) * 100) / 100 : e.amount, tip: e.tip || '', service: e.service || '', category: e.category || null, tip_cash: !!e.tip_cash, currency: e.currency, method: e.method,
    paid_by: e.paid_by ?? null, base_amount: e.base_amount ?? '',
  })
  split.value = e.split || null
}
load()

// Mens kvitteringen aflæses: hent igen, og fyld felterne når den er færdig.
let timer: any
watch(() => data.value?.entry?.status, (st, old) => {
  clearInterval(timer)
  if (st === 'reading') timer = setInterval(() => refresh(), 2500)
  if (old === 'reading' && st !== 'reading') load()
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

// Det betalte i alt (= amount i databasen): regningen + tips. Tomt felt uden tips = intet beløb endnu.
const total = computed(() => {
  const tip = f.kind === 'expense' ? parseAmount(f.tip) : 0
  if (String(f.amount ?? '').trim() === '' && !tip) return null
  return Math.round((parseAmount(f.amount) + tip) * 100) / 100
})
// Det der skal betales til stedet: i alt minus tips givet kontant ved siden af.
const toPay = computed(() => (total.value || 0) - (f.tip_cash && f.method !== 'cash' ? parseAmount(f.tip) : 0))

const saving = ref(false)
async function save(back = true) {
  saving.value = true
  try {
    await api(`/entries/${eid}`, { method: 'PATCH', body: { ...f, amount: total.value, tip: f.kind === 'expense' ? f.tip : 0, split: split.value } })
    if (back) await navigateTo(`/p/${pid}`)
    else await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { saving.value = false }
}

async function remove() {
  if (!confirm('Slet posten og dens billeder?')) return
  await api(`/entries/${eid}`, { method: 'DELETE' })
  await navigateTo(`/p/${pid}`)
}

const more = ref<HTMLInputElement>()
const uploading = ref(false)
async function addImages(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (!input.files?.length) return
  uploading.value = true
  try {
    await save(false)
    await api(`/entries/${eid}/attachments`, { method: 'POST', body: await imagesForm(input.files) })
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { uploading.value = false; input.value = '' }
}
async function delImage(aid: number) {
  if (!confirm('Fjern billedet?')) return
  await api(`/attachments/${aid}`, { method: 'DELETE' })
  await refresh()
}
async function reread(reset: boolean) {
  if (reset && !confirm('Ryd beløb, drikkepenge og tekst og aflæs forfra?')) return
  if (!reset) await save(false)
  await api(`/entries/${eid}/read${reset ? '?reset=1' : ''}`, { method: 'POST' })
  await refresh()
}
const viewing = ref<number | null>(null)
const e = computed(() => data.value?.entry)
async function refund() {
  await save(false)
  await api(`/entries/${eid}/refund`, { method: 'POST', body: { date: localDate() } })
  await refresh()
}
const newPay = reactive({ amount: '', method: 'card' })
async function addPayment() {
  try {
    await save(false)
    await api(`/entries/${eid}/payments`, { method: 'POST', body: { ...newPay, paid_by: f.paid_by } })
    Object.assign(newPay, { amount: '' })
    await refresh()
  } catch (err) { toast.add({ title: errMsg(err), color: 'error' }) }
}
async function delPayment(pid: number) {
  if (!confirm('Fjern betalingen?')) return
  await api(`/payments/${pid}`, { method: 'DELETE' })
  await refresh()
}
async function reopen() {
  if (!confirm(e.value?.kind === 'deposit' ? 'Sæt depositummet tilbage som udestående?' : 'Sæt posten tilbage på den åbne hotelregning?')) return
  await api(`/entries/${eid}`, { method: 'PATCH', body: { settled: false } })
  await refresh()
}
const rateText = computed(() => {
  if (!e.value?.rate || e.value.currency === base.value) return ''
  const src = { market: 'markedskurs', cash: 'kontantkurs fra hævninger', fixed: 'fast kurs' }[e.value.rate_source as string]
  return `${(e.value.rate * 100).toFixed(2)} ${base.value} pr. 100 ${e.value.currency} · ${src}`
})
</script>

<template>
  <div v-if="e" class="mx-auto max-w-xl pb-28">
    <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-default/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <UButton :to="`/p/${pid}`" icon="i-lucide-chevron-left" variant="ghost" color="neutral" square />
      <h1 class="flex-1 truncate text-lg font-semibold">{{ e.merchant || KIND_LABEL[e.kind] }}</h1>
      <UButton icon="i-lucide-trash-2" variant="ghost" color="error" square @click="remove" />
    </header>

    <div class="space-y-5 p-4">
      <!-- Billeder -->
      <div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <div v-for="a in e.attachments" :key="a" class="relative shrink-0">
            <img :src="attUrl(a)" class="h-28 w-20 rounded-lg border border-default object-cover" @click="viewing = a">
            <button class="absolute -right-1 -top-1 rounded-full bg-default p-0.5 shadow" @click="delImage(a)"><UIcon name="i-lucide-x" class="size-4" /></button>
          </div>
          <button class="flex h-28 w-20 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-default text-xs text-muted" @click="more?.click()">
            <UIcon :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-camera'" class="size-6" :class="uploading ? 'animate-spin' : ''" />
            Tilføj
          </button>
          <input ref="more" type="file" accept="image/*" multiple class="hidden" @change="addImages">
        </div>
        <div v-if="e.status === 'reading'" class="mt-2 flex items-center gap-2 text-sm text-primary">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Aflæser kvitteringen… du kan godt gå videre.
        </div>
        <div v-else-if="e.attachments.length" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span v-if="e.status === 'failed'" class="text-warning">Aflæsning fejlede.</span>
          <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-scan-text" label="Udfyld tomme felter" @click="reread(false)" />
          <UButton size="xs" variant="ghost" color="neutral" label="Aflæs forfra" @click="reread(true)" />
        </div>
        <p v-if="e.ai_note" class="mt-1 text-xs text-muted">{{ e.ai_note }}</p>
      </div>

      <KindTabs v-model="f.kind" @change="k => { if (k === 'withdrawal') f.method = 'cash'; else if (!isSpend(k) && ['room', 'later'].includes(f.method) || k === 'credit' && f.method === 'later') f.method = 'card' }" />

      <div class="flex items-end gap-2">
        <UFormField label="Beløb" class="flex-1"><UInput v-model="f.amount" inputmode="decimal" size="lg" class="w-full" :ui="{ base: 'tabular-nums' }" /></UFormField>
        <CurrencyPicker v-model="f.currency" :options="[data.project.currency, base]" size="lg" />
      </div>
      <p v-if="rateText" class="-mt-3 text-xs text-muted">≈ {{ money(e.base_value, base) }} · {{ rateText }}</p>

      <UFormField label="Dato"><UInput v-model="f.occurred_at" type="date" class="w-full" /></UFormField>

      <UFormField v-if="f.kind === 'withdrawal'" :label="`Trukket på kontoen (${base})`" help="Det banken trak inkl. gebyrer — bruges som kurs for alle kontantudgifter i denne valuta">
        <UInput v-model="f.base_amount" inputmode="decimal" class="w-full" />
      </UFormField>

      <UFormField label="Sted"><UInput v-model="f.merchant" class="w-full" /></UFormField>
      <UFormField label="Beskrivelse"><UTextarea v-model="f.description" :rows="2" autoresize class="w-full" /></UFormField>

      <UFormField v-if="isSpend(f.kind)" label="Kategori" :help="!f.category ? 'Claude foreslår en ud fra kvittering/beskrivelse — eller vælg selv' : undefined">
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="c in CATEGORIES" :key="c.key" type="button"
            class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm"
            :class="f.category === c.key ? 'border-primary bg-primary/10 font-medium' : 'border-default text-muted'"
            @click="f.category = f.category === c.key ? null : c.key">
            <UIcon :name="c.icon" class="size-4 shrink-0" />{{ c.label }}
          </button>
        </div>
      </UFormField>

      <UFormField v-if="f.kind !== 'withdrawal'" :label="f.kind === 'credit' ? 'Givet som' : 'Betalt med'">
        <MethodPicker v-model="f.method" :room="isSpend(f.kind)" :later="f.kind === 'expense'" />
      </UFormField>
      <div v-if="isSpend(f.kind) && f.method === 'room' && e.method === 'room'" class="-mt-2 flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-sm">
        <span v-if="e.settled_at">Regningen betalt {{ e.settled_at }} ({{ e.settled_method === 'cash' ? 'kontant' : 'kort' }})</span>
        <span v-else class="text-muted">På den åbne hotelregning</span>
        <UButton v-if="e.settled_at" size="xs" variant="ghost" color="neutral" label="Genåbn" @click="reopen" />
      </div>
      <!-- Depositum: status og retur -->
      <div v-if="f.kind === 'deposit' && e.kind === 'deposit'" class="-mt-2 flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2 text-sm">
        <span v-if="!e.settled_at" class="text-muted">{{ e.method === 'cash' ? 'Kontant — ude af pungen' : 'Reserveret på kort' }}, tæller ikke som forbrug</span>
        <span v-else-if="e.settled_method === 'refund'">Fået tilbage {{ e.settled_at }}</span>
        <span v-else>Modregnet i hotelregningen {{ e.settled_at }}<template v-if="e.refunded"> · {{ money(e.refunded, e.currency) }} retur</template></span>
        <UButton v-if="!e.settled_at" size="xs" icon="i-lucide-check" label="Fået tilbage" @click="refund" />
        <UButton v-else size="xs" variant="ghost" color="neutral" label="Genåbn" @click="reopen" />
      </div>

      <!-- Betales senere: betalinger -->
      <div v-if="f.kind === 'expense' && f.method === 'later'" class="-mt-2 space-y-2 rounded-lg bg-elevated p-3 text-sm">
        <div class="flex justify-between"><span class="text-muted">Betalt</span><span class="tabular-nums">{{ money(e.paid, e.currency) }} af {{ money(toPay, e.currency) }}</span></div>
        <div v-for="p in e.payments" :key="p.id" class="flex items-center justify-between text-xs">
          <span>{{ p.occurred_at }} · {{ p.method === 'cash' ? 'kontant' : 'kort' }}</span>
          <span class="flex items-center gap-1 tabular-nums">{{ money(p.amount, p.currency) }}
            <UButton size="xs" icon="i-lucide-x" variant="ghost" color="neutral" square @click="delPayment(p.id)" /></span>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <UInput v-model="newPay.amount" inputmode="decimal" :placeholder="`Rest ${money(Math.max(0, toPay - e.paid), e.currency)}`" size="sm" class="flex-1" />
          <MethodPicker v-model="newPay.method" :room="false" size="sm" />
          <UButton size="sm" icon="i-lucide-plus" square :disabled="!newPay.amount" @click="addPayment" />
        </div>
      </div>

      <div v-if="f.kind === 'expense'" class="grid grid-cols-2 gap-2">
        <TipInput v-model:tip="f.tip" v-model:tip-cash="f.tip_cash" :method="f.method" :total="total" :currency="f.currency" />
        <UFormField label="Heraf service charge" help="Fast tillæg på regningen">
          <UInput v-model="f.service" inputmode="decimal" class="w-full" placeholder="0" />
        </UFormField>
      </div>

      <template v-if="isSpend(f.kind) && people.length">
        <UFormField :label="f.kind === 'credit' ? 'Modtaget af' : 'Betalt af'">
          <div class="flex flex-wrap gap-1.5">
            <UButton v-for="p in people" :key="p.id" size="sm" :variant="f.paid_by === p.id ? 'solid' : 'soft'" color="neutral"
              :label="p.name" @click="f.paid_by = f.paid_by === p.id ? null : p.id" />
          </div>
        </UFormField>

        <div class="rounded-xl border border-default p-3">
          <div class="mb-2 text-sm font-medium">Fordeling</div>
          <SplitEditor v-model="split" :people="people" :base-value="e.base_value" :base="base" />
        </div>
      </template>
    </div>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div class="mx-auto max-w-xl"><UButton block size="xl" :loading="saving" label="Gem" @click="save()" /></div>
    </div>

    <div v-if="viewing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2" @click="viewing = null">
      <img :src="attUrl(viewing)" class="max-h-full max-w-full object-contain">
    </div>
  </div>
</template>
