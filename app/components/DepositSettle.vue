<script setup lang="ts">
// Afstem et depositum: alt retur, delvist (resten modregnet — skade, forbrug …) eller intet
// retur. Det modregnede tæller som forbrug. Kontant retur lægges i pungen, også når
// depositummet blev betalt med kort. Gælder depositum-poster og "heraf depositum" på en udgift.
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ entry: any, title: string }>()
const emit = defineEmits<{ done: [] }>()
const toast = useToast()
const st = reactive({ mode: 'all' as 'all' | 'part' | 'none', back: '', method: 'card', date: '' })
watch(open, (o) => {
  if (o && props.entry) Object.assign(st, { mode: 'all', back: '', method: props.entry.method === 'cash' ? 'cash' : 'card', date: localDate() })
})
const cur = computed(() => props.entry?.currency || '')
const held = computed(() => props.entry?.dep?.held || 0)
const back = computed(() => st.mode === 'all' ? held.value : st.mode === 'none' ? 0 : Math.min(held.value, parseAmount(st.back)))
const kept = computed(() => Math.round((held.value - back.value) * 100) / 100)
const MODES = [{ key: 'all', label: 'Alt retur' }, { key: 'part', label: 'Delvist' }, { key: 'none', label: 'Intet retur' }] as const
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api(`/entries/${props.entry.id}/refund`, { method: 'POST', body: { back: back.value, method: st.method, date: st.date } })
    toast.add({
      title: 'Depositum afstemt',
      description: [back.value ? `${money(back.value, cur.value)} retur${st.method === 'cash' ? ' — lagt i pungen' : ' på kort'}` : '', kept.value ? `${money(kept.value, cur.value)} modregnet som forbrug` : ''].filter(Boolean).join(' · '),
      color: 'success',
    })
    open.value = false
    emit('done')
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Afstem depositum">
    <template #body>
      <form v-if="entry" class="space-y-4" @submit.prevent="save">
        <div class="rounded-lg bg-elevated px-3 py-2 text-sm">
          <div class="truncate font-medium">{{ title }}</div>
          <div class="text-muted">{{ money(held, cur) }} i depositum · {{ entry.method === 'cash' ? 'betalt kontant' : 'betalt med kort' }}</div>
        </div>
        <UFormField label="Fik I det tilbage?">
          <div class="grid grid-cols-3 gap-1.5">
            <UButton v-for="x in MODES" :key="x.key" type="button" block :variant="st.mode === x.key ? 'solid' : 'soft'" color="neutral" :label="x.label" @click="st.mode = x.key" />
          </div>
        </UFormField>
        <UFormField v-if="st.mode === 'part'" label="Fået retur">
          <UInput v-model="st.back" inputmode="decimal" class="w-full" :placeholder="`Af ${money(held, cur)}`" autofocus />
        </UFormField>
        <p v-if="kept > 0" class="rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <b class="tabular-nums">{{ money(kept, cur) }}</b> modregnet (fx skade eller forbrug) — tæller som forbrug<template v-if="entry.kind === 'deposit' && !entry.split"> og skal fordeles</template>.
        </p>
        <UFormField v-if="back > 0" label="Kom retur som" :help="st.method === 'cash' ? 'Lægges i pungen' : 'Frigivet eller tilbageført på kortet'">
          <div class="flex gap-1.5">
            <UButton type="button" :variant="st.method === 'card' ? 'solid' : 'soft'" color="neutral" icon="i-lucide-credit-card" label="Kort" @click="st.method = 'card'" />
            <UButton type="button" :variant="st.method === 'cash' ? 'solid' : 'soft'" color="neutral" icon="i-lucide-banknote" label="Kontant" @click="st.method = 'cash'" />
          </div>
        </UFormField>
        <UFormField label="Dato"><UInput v-model="st.date" type="date" class="w-full" /></UFormField>
        <p v-if="entry.kind === 'deposit' && entry.stay" class="text-xs text-muted">Skal depositummet bruges til at betale hotelregningen, så brug “Betal” på regningen og modregn det dér.</p>
        <UButton type="submit" block size="lg" label="Gem afstemning" :loading="saving" :disabled="st.mode === 'part' && st.back === ''" />
      </form>
    </template>
  </UModal>
</template>
