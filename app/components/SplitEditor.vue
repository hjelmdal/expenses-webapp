<script setup lang="ts">
// Fordeling af en udgift: senere (ingen) · ligeligt mellem valgte · efter andele (vægte).
// Bruges på posten, ved massefordeling og som turens standard.
type Split = { mode: 'equal', pids: number[] } | { mode: 'weights', shares: Record<string, number> } | null
const model = defineModel<Split>({ required: true })
const props = defineProps<{ people: { id: number, name: string, weight: number }[], baseValue?: number | null, base?: string }>()

const mode = ref<'none' | 'equal' | 'weights'>('none')
const eqIds = ref<number[]>([])
const weights = reactive<Record<number, string>>({})
function load(s: Split) {
  mode.value = s?.mode || 'none'
  eqIds.value = s?.mode === 'equal' ? [...s.pids] : props.people.map(p => p.id)
  for (const p of props.people) weights[p.id] = String(s?.mode === 'weights' ? (s.shares[p.id] ?? '') : p.weight)
}
load(model.value)

const num = (v: any) => Number(String(v ?? '').replace(',', '.')) || 0
const out = computed<Split>(() => {
  if (mode.value === 'equal') return { mode: 'equal', pids: eqIds.value }
  if (mode.value === 'weights') {
    const shares: Record<string, number> = {}
    for (const p of props.people) { const w = num(weights[p.id]); if (w > 0) shares[p.id] = w }
    return { mode: 'weights', shares }
  }
  return null
})
watch(out, v => { model.value = v }, { deep: true })
// Ændres fordelingen udefra (fx posten genindlæses), følger editoren med.
watch(model, v => { if (JSON.stringify(v) !== JSON.stringify(out.value)) load(v) })

const weightSum = computed(() => props.people.reduce((s, p) => s + num(weights[p.id]), 0))
const pct = (id: number) => weightSum.value ? Math.round(num(weights[id]) / weightSum.value * 100) : 0
function toggle(id: number) {
  eqIds.value = eqIds.value.includes(id) ? eqIds.value.filter(x => x !== id) : [...eqIds.value, id]
}
</script>

<template>
  <div>
    <div class="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-elevated p-1 text-sm">
      <button v-for="[k, l] in [['none', 'Senere'], ['equal', 'Ligeligt'], ['weights', 'Andele']]" :key="k" type="button"
        class="rounded-md py-1.5" :class="mode === k ? 'bg-default font-medium shadow-sm' : 'text-muted'"
        @click="mode = k as any">{{ l }}</button>
    </div>
    <div v-if="mode === 'equal'" class="flex flex-wrap gap-1.5">
      <UButton v-for="p in people" :key="p.id" type="button" size="sm" :variant="eqIds.includes(p.id) ? 'solid' : 'outline'"
        :icon="eqIds.includes(p.id) ? 'i-lucide-check' : undefined" :label="p.name" @click="toggle(p.id)" />
      <p class="w-full pt-1 text-xs text-muted">
        {{ eqIds.length }} deler<template v-if="eqIds.length && baseValue"> · {{ money(baseValue / eqIds.length, base || 'DKK') }} hver</template>
      </p>
    </div>
    <div v-else-if="mode === 'weights'" class="space-y-2">
      <div v-for="p in people" :key="p.id" class="flex items-center gap-2">
        <span class="flex-1 text-sm">{{ p.name }}</span>
        <UInput v-model="weights[p.id]" inputmode="decimal" size="sm" class="w-20" :ui="{ base: 'text-right tabular-nums' }" />
        <span class="w-12 text-right text-sm tabular-nums text-muted">{{ pct(p.id) }}%</span>
      </div>
      <p class="text-xs text-muted">Vægte — fx 2 / 1 / 1 eller 50 / 25 / 25. Tom eller 0 = deltager ikke.</p>
    </div>
    <p v-else class="text-xs text-muted">Tæller med i det samlede forbrug, men ikke på personer endnu.</p>
  </div>
</template>
