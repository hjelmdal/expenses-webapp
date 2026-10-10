<script setup lang="ts">
const toast = useToast()
const { data: projects, refresh } = await useAsyncData('projects', () => api<any[]>('/projects'))
const open = ref(false)
const form = reactive({ name: '', currency: 'THB', base_currency: 'DKK', people: 'Far, Mor, Barn 1, Barn 2' })
const saving = ref(false)
const mode = useColorMode()
const isDark = computed(() => mode.value === 'dark')

async function create() {
  saving.value = true
  try {
    const participants = form.people.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name }))
    const r = await api<{ id: number }>('/projects', { method: 'POST', body: { ...form, participants } })
    await navigateTo(`/p/${r.id}`)
  } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) } finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-xl p-4 pt-[max(1rem,env(safe-area-inset-top))]">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Udlæg</h1>
      <div class="flex items-center gap-1">
        <UButton :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" variant="ghost" color="neutral" square
          :aria-label="isDark ? 'Lys tilstand' : 'Mørk tilstand'" @click="mode.preference = isDark ? 'light' : 'dark'" />
        <UButton icon="i-lucide-plus" label="Ny tur" @click="open = true" />
      </div>
    </div>

    <div v-if="!projects?.length" class="rounded-xl border border-dashed border-default p-8 text-center text-muted">
      Ingen ture endnu. Opret den første — fx “Thailand 2026”.
    </div>

    <div class="space-y-2">
      <NuxtLink v-for="p in projects" :key="p.id" :to="`/p/${p.id}`"
        class="flex items-center justify-between rounded-xl border border-default bg-default p-4 active:bg-elevated"
        :class="p.archived ? 'opacity-60' : ''">
        <div>
          <div class="font-medium">{{ p.name }}</div>
          <div class="text-sm text-muted">{{ p.entry_count }} poster · {{ p.currency }}<span v-if="p.archived"> · arkiveret</span></div>
        </div>
        <UIcon name="i-lucide-chevron-right" class="size-5 text-muted" />
      </NuxtLink>
    </div>

    <div class="mt-10">
      <div class="mb-2 text-sm text-muted">Udseende</div>
      <ColorModeSwitch />
    </div>

    <UModal v-model:open="open" title="Ny tur eller projekt">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UFormField label="Navn"><UInput v-model="form.name" placeholder="Thailand 2026" class="w-full" autofocus /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Lokal valuta" help="Det I betaler i"><UInput v-model="form.currency" class="w-full uppercase" maxlength="3" /></UFormField>
            <UFormField label="Hjemmevaluta" help="Overblik i"><UInput v-model="form.base_currency" class="w-full uppercase" maxlength="3" /></UFormField>
          </div>
          <UFormField label="Deltagere" help="Kommasepareret — kan rettes senere"><UInput v-model="form.people" class="w-full" /></UFormField>
          <UButton type="submit" block :loading="saving" :disabled="!form.name.trim()" label="Opret" />
        </form>
      </template>
    </UModal>
  </div>
</template>
