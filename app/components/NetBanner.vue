<script setup lang="ts">
// Offline: viser hvor gamle de viste data er — eller at Access vil have et nyt login.
const { offlineSince, needsLogin } = useNet()
const time = computed(() => {
  if (!offlineSince.value) return ''
  const d = new Date(offlineSince.value)
  if (!d.getTime()) return ''
  const same = localDate(d) === localDate()
  return same ? d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
})
// Fuld indlæsning forbi app-skallen, så Access kan vise login-siden.
const login = () => window.location.assign(`/?login=${Date.now()}`)
</script>

<template>
  <div v-if="needsLogin || offlineSince" class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    <button v-if="needsLogin" type="button" class="pointer-events-auto mb-24 flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm text-white shadow-lg" @click="login">
      <UIcon name="i-lucide-log-in" class="size-4" />
      Login er udløbet — tryk for at logge ind igen
    </button>
    <div v-else class="mb-24 flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg">
      <UIcon name="i-lucide-wifi-off" class="size-4" />
      Offline{{ time ? ` · data fra ${time}` : '' }}
    </div>
  </div>
</template>
