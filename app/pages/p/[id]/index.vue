<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const id = Number(route.params.id)
const { data, refresh } = await useAsyncData(`p-${id}`, () => api<any>(`/projects/${id}`))
const p = computed(() => data.value?.project)
const s = computed(() => data.value?.summary)

// Mens kvitteringer aflæses, hentes turen igen hvert 3. sekund.
let timer: any
watch(() => s.value?.reading, (n) => {
  clearInterval(timer)
  if (n) timer = setInterval(() => refresh(), 3000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

const days = computed(() => {
  const g: { day: string, items: any[], total: number }[] = []
  for (const e of data.value?.entries || []) {
    let d = g.find(x => x.day === e.occurred_at)
    if (!d) g.push(d = { day: e.occurred_at, items: [], total: 0 })
    d.items.push(e)
    if (e.kind === 'expense') d.total += e.base_value || 0
  }
  return g
})

// --- Foto: ét tryk = ny post, gemt med det samme og aflæst i baggrunden.
const camera = ref<HTMLInputElement>()
const library = ref<HTMLInputElement>()
const addTo = ref<number | null>(null)   // post der skal have flere billeder
const uploading = ref(false)
const lastPhoto = ref<number | null>(null)

function snap(target: number | null = null, fromLibrary = false) {
  addTo.value = target
  ;(fromLibrary ? library : camera).value?.click()
}

async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  uploading.value = true
  try {
    if (addTo.value) {
      await api(`/entries/${addTo.value}/attachments`, { method: 'POST', body: await imagesForm(files) })
      toast.add({ title: 'Billede tilføjet — aflæser igen', color: 'success' })
    } else {
      const r = await api<{ id: number }>(`/projects/${id}/entries`, {
        method: 'POST', body: await imagesForm(files, { occurred_at: localDate() }),
      })
      lastPhoto.value = r.id
      toast.add({ title: 'Gemt — aflæser kvitteringen…', color: 'success' })
    }
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally {
    uploading.value = false
    input.value = ''
  }
}

// --- Hurtig indtastning
const quick = ref(false)
const q = reactive({ kind: 'expense', amount: '', currency: '', description: '', method: 'card', base_amount: '', occurred_at: '' })
const today = () => localDate()
const yesterday = () => localDate(new Date(Date.now() - 864e5))
function openQuick(kind = 'expense') {
  Object.assign(q, { kind, amount: '', currency: p.value.currency, description: '', method: kind === 'withdrawal' ? 'cash' : 'card', base_amount: '',
    // Datoen huskes mellem poster i samme session — taster man gårsdagen ind, er det typisk flere.
    occurred_at: q.occurred_at || today() })
  quick.value = true
}
const savingQuick = ref(false)
async function saveQuick() {
  savingQuick.value = true
  try {
    await api(`/projects/${id}/entries`, { method: 'POST', body: { ...q } })
    quick.value = false
    await refresh()
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { savingQuick.value = false }
}

const base = computed(() => p.value?.base_currency || 'DKK')
function rowTitle(e: any) {
  return e.merchant || e.description || (e.kind === 'withdrawal' ? 'Kontanthævning' : e.status === 'reading' ? 'Aflæser kvittering…' : 'Udgift')
}
const rowMeta = (e: any) => [
  e.kind !== 'expense' ? KIND_LABEL[e.kind] : '',
  e.method === 'cash' && e.kind !== 'withdrawal' ? 'kontant' : '',
  e.tip ? `tip ${money(e.tip, e.currency)}` : '',
  splitShort(e),
].filter(Boolean).join(' · ')
const splitShort = (e: any) => {
  if (e.kind !== 'expense') return ''
  if (!e.split) return 'ikke fordelt'
  const ids = e.split.mode === 'equal' ? e.split.pids : Object.keys(e.split.shares)
  return `${ids.length} deler`
}
</script>

<template>
  <div v-if="p" class="mx-auto max-w-xl pb-36">
    <header class="sticky top-0 z-10 border-b border-default bg-default/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div class="flex items-center gap-2">
        <UButton to="/" icon="i-lucide-chevron-left" variant="ghost" color="neutral" square />
        <h1 class="flex-1 truncate text-lg font-semibold">{{ p.name }}</h1>
        <UButton :to="`/p/${id}/settings`" icon="i-lucide-settings" variant="ghost" color="neutral" square />
      </div>
    </header>

    <!-- Overblik -->
    <section class="space-y-3 p-4">
      <div class="rounded-2xl bg-primary p-4 text-inverted">
        <div class="text-sm opacity-80">Brugt i alt</div>
        <div class="text-3xl font-semibold tabular-nums">{{ money(s.spent, base) }}</div>
        <div class="mt-1 flex flex-wrap gap-x-3 text-sm opacity-90">
          <span v-for="(v, c) in s.byCurrency" :key="c" class="tabular-nums">{{ money(v, String(c)) }}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="rounded-xl border border-default p-3">
          <div class="text-muted">Drikkepenge</div>
          <div class="font-medium tabular-nums">{{ money(s.tips, base) }}</div>
        </div>
        <div class="rounded-xl border border-default p-3">
          <div class="text-muted">Ikke fordelt</div>
          <div class="font-medium tabular-nums">{{ money(s.unsplit, base) }}</div>
        </div>
        <div v-for="(v, c) in s.cash" :key="c" class="rounded-xl border border-default p-3">
          <div class="text-muted">Kontanter tilbage</div>
          <div class="font-medium tabular-nums" :class="v < 0 ? 'text-error' : ''">{{ money(v, String(c)) }}</div>
          <div v-if="s.cashRate[c]" class="text-xs text-muted">kurs {{ (s.cashRate[c] * 100).toFixed(2) }} {{ base }}/100</div>
        </div>
        <div v-if="s.income" class="rounded-xl border border-default p-3">
          <div class="text-muted">Indtægter</div>
          <div class="font-medium tabular-nums">{{ money(s.income, base) }}</div>
        </div>
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
      <div v-if="!days.length" class="rounded-xl border border-dashed border-default p-8 text-center text-muted">
        Tag et billede af første kvittering, eller indtast et beløb.
      </div>
      <div v-for="d in days" :key="d.day" class="mb-4">
        <div class="mb-1 flex justify-between px-1 text-xs font-medium uppercase tracking-wide text-muted">
          <span>{{ dayLabel(d.day) }}</span><span class="tabular-nums">{{ money(d.total, base) }}</span>
        </div>
        <div class="divide-y divide-default overflow-hidden rounded-xl border border-default">
          <NuxtLink v-for="e in d.items" :key="e.id" :to="`/p/${id}/e/${e.id}`" class="flex items-center gap-3 p-3 active:bg-elevated">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated">
              <UIcon v-if="e.status === 'reading'" name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
              <UIcon v-else-if="e.status === 'failed'" name="i-lucide-triangle-alert" class="size-5 text-warning" />
              <UIcon v-else-if="e.kind === 'withdrawal'" name="i-lucide-banknote" class="size-5" />
              <UIcon v-else-if="e.kind === 'income'" name="i-lucide-arrow-down-left" class="size-5 text-success" />
              <UIcon v-else :name="e.attachments.length ? 'i-lucide-receipt' : 'i-lucide-pencil'" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ rowTitle(e) }}</div>
              <div class="truncate text-xs text-muted">{{ rowMeta(e) }}</div>
            </div>
            <div class="text-right tabular-nums">
              <div class="font-medium" :class="e.kind === 'income' ? 'text-success' : ''">{{ e.amount != null ? money(e.amount, e.currency) : '—' }}</div>
              <div v-if="e.currency !== base && e.base_value != null" class="text-xs text-muted">{{ money(e.base_value, base) }}</div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Inputbar -->
    <input ref="camera" type="file" accept="image/*" capture="environment" class="hidden" @change="onFiles">
    <input ref="library" type="file" accept="image/*" multiple class="hidden" @change="onFiles">
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div class="mx-auto flex max-w-xl gap-2">
        <UButton size="xl" class="flex-1 justify-center" icon="i-lucide-camera" :loading="uploading" label="Kvittering" @click="snap()" />
        <UButton size="xl" color="neutral" variant="soft" icon="i-lucide-images" square aria-label="Fra billeder" @click="snap(null, true)" />
        <UButton size="xl" color="neutral" variant="soft" icon="i-lucide-keyboard" label="Beløb" @click="openQuick()" />
      </div>
    </div>

    <UModal v-model:open="quick" title="Ny post">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveQuick">
          <div class="grid grid-cols-3 gap-1 rounded-lg bg-elevated p-1 text-sm">
            <button v-for="k in ['expense', 'withdrawal', 'income']" :key="k" type="button"
              class="rounded-md py-1.5" :class="q.kind === k ? 'bg-default font-medium shadow-sm' : 'text-muted'"
              @click="q.kind = k; q.method = k === 'withdrawal' ? 'cash' : q.method">{{ KIND_LABEL[k] }}</button>
          </div>
          <div class="flex gap-2">
            <UInput v-model="q.amount" inputmode="decimal" placeholder="0" size="xl" class="flex-1" autofocus
              :ui="{ base: 'text-2xl tabular-nums' }" />
            <UInput v-model="q.currency" size="xl" class="w-24 uppercase" maxlength="3" />
          </div>
          <UFormField v-if="q.kind === 'withdrawal'" :label="`Trukket på kontoen (${base})`" help="Det banken trak — giver den reelle kontantkurs inkl. gebyrer">
            <UInput v-model="q.base_amount" inputmode="decimal" class="w-full" />
          </UFormField>
          <UInput v-model="q.description" placeholder="Hvad var det? (valgfrit)" class="w-full" />
          <div class="flex items-center gap-2">
            <UButton type="button" size="sm" :variant="q.occurred_at === today() ? 'solid' : 'soft'" color="neutral" label="I dag" @click="q.occurred_at = today()" />
            <UButton type="button" size="sm" :variant="q.occurred_at === yesterday() ? 'solid' : 'soft'" color="neutral" label="I går" @click="q.occurred_at = yesterday()" />
            <UInput v-model="q.occurred_at" type="date" size="sm" class="flex-1" />
          </div>
          <div v-if="q.kind !== 'withdrawal'" class="flex gap-2 text-sm">
            <UButton type="button" :variant="q.method === 'card' ? 'solid' : 'soft'" color="neutral" icon="i-lucide-credit-card" label="Kort" @click="q.method = 'card'" />
            <UButton type="button" :variant="q.method === 'cash' ? 'solid' : 'soft'" color="neutral" icon="i-lucide-banknote" label="Kontant" @click="q.method = 'cash'" />
          </div>
          <UButton type="submit" block size="lg" :loading="savingQuick" :disabled="!q.amount" label="Gem" />
        </form>
      </template>
    </UModal>
  </div>
</template>
