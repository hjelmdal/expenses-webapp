<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const id = Number(route.params.id)
const { data, refresh } = await useAsyncData(`p-${id}`, () => api<any>(`/projects/${id}`))
const p = computed(() => data.value?.project)
const form = reactive({ name: '', currency: '', base_currency: '' })
watchEffect(() => { if (p.value) Object.assign(form, { name: p.value.name, currency: p.value.currency, base_currency: p.value.base_currency }) })

async function run(fn: () => Promise<any>) {
  try { await fn(); await refresh() } catch (e) { toast.add({ title: errMsg(e), color: 'error' }) }
}
const saveProject = () => run(async () => {
  await api(`/projects/${id}`, { method: 'PATCH', body: form })
  toast.add({ title: 'Gemt', color: 'success' })
})
const archive = () => run(() => api(`/projects/${id}`, { method: 'PATCH', body: { archived: !p.value.archived } }))
async function destroy() {
  if (prompt(`Skriv "${p.value.name}" for at slette turen med alle poster og billeder`) !== p.value.name) return
  await api(`/projects/${id}`, { method: 'DELETE' })
  await navigateTo('/')
}

const newPerson = reactive({ name: '', weight: '1' })
const addPerson = () => run(async () => {
  await api(`/projects/${id}/participants`, { method: 'POST', body: newPerson })
  Object.assign(newPerson, { name: '', weight: '1' })
})
const updatePerson = (x: any) => run(() => api(`/participants/${x.id}`, { method: 'PATCH', body: { name: x.name, weight: x.weight } }))
const delPerson = (x: any) => confirm(`Fjern ${x.name}? Fordelinger med personen mister den.`) && run(() => api(`/participants/${x.id}`, { method: 'DELETE' }))

const newMember = ref('')
const addMember = () => run(async () => { await api(`/projects/${id}/members`, { method: 'POST', body: { email: newMember.value } }); newMember.value = '' })
const delMember = (email: string) => confirm(`Fjern adgang for ${email}?`) && run(() => api(`/projects/${id}/members`, { method: 'DELETE', query: { email } }))
</script>

<template>
  <div v-if="p" class="mx-auto max-w-xl pb-12">
    <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-default/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <UButton :to="`/p/${id}`" icon="i-lucide-chevron-left" variant="ghost" color="neutral" square />
      <h1 class="flex-1 text-lg font-semibold">Indstillinger</h1>
    </header>

    <div class="space-y-8 p-4">
      <section class="space-y-3">
        <UFormField label="Navn"><UInput v-model="form.name" class="w-full" /></UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Lokal valuta" help="Standard for nye poster"><UInput v-model="form.currency" maxlength="3" class="w-full uppercase" /></UFormField>
          <UFormField label="Hjemmevaluta" help="Overblikket regnes i"><UInput v-model="form.base_currency" maxlength="3" class="w-full uppercase" /></UFormField>
        </div>
        <UButton label="Gem" @click="saveProject" />
      </section>

      <section>
        <h2 class="mb-1 font-medium">Deltagere</h2>
        <p class="mb-3 text-sm text-muted">Dem der deler udgifterne. Vægt er standard ved fordeling efter andele (fx voksen 2, barn 1).</p>
        <div class="space-y-2">
          <div v-for="x in data.participants" :key="x.id" class="flex items-center gap-2">
            <UInput v-model="x.name" class="flex-1" @change="updatePerson(x)" />
            <UInput v-model="x.weight" inputmode="decimal" class="w-16" :ui="{ base: 'text-right' }" @change="updatePerson(x)" />
            <UButton icon="i-lucide-trash-2" variant="ghost" color="neutral" square @click="delPerson(x)" />
          </div>
          <form class="flex items-center gap-2" @submit.prevent="addPerson">
            <UInput v-model="newPerson.name" placeholder="Navn" class="flex-1" />
            <UInput v-model="newPerson.weight" inputmode="decimal" class="w-16" :ui="{ base: 'text-right' }" />
            <UButton type="submit" icon="i-lucide-plus" square :disabled="!newPerson.name.trim()" />
          </form>
        </div>
      </section>

      <section>
        <h2 class="mb-1 font-medium">Adgang</h2>
        <p class="mb-3 text-sm text-muted">E-mails der kan se og redigere turen. De skal også være lukket ind i Cloudflare Access for appen.</p>
        <div class="space-y-1">
          <div v-for="m in data.members" :key="m" class="flex items-center justify-between rounded-lg bg-elevated px-3 py-2 text-sm">
            <span>{{ m }}<span v-if="m === data.me" class="text-muted"> (dig)</span></span>
            <UButton v-if="m !== data.me" icon="i-lucide-x" size="xs" variant="ghost" color="neutral" square @click="delMember(m)" />
          </div>
          <form class="flex gap-2 pt-1" @submit.prevent="addMember">
            <UInput v-model="newMember" type="email" placeholder="ven@example.com" class="flex-1" />
            <UButton type="submit" icon="i-lucide-plus" square :disabled="!newMember.includes('@')" />
          </form>
        </div>
      </section>

      <section class="flex flex-wrap gap-2 border-t border-default pt-6">
        <UButton color="neutral" variant="soft" :label="p.archived ? 'Genåbn' : 'Arkivér'" @click="archive" />
        <UButton color="error" variant="soft" label="Slet tur" @click="destroy" />
      </section>
    </div>
  </div>
</template>
