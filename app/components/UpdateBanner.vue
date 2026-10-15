<script setup lang="ts">
// Vises når serveren kører en nyere version end den, appen er indlæst med.
const latest = useState<string | null>('latest-version', () => null)
const reload = () => window.location.reload()
</script>

<template>
  <div v-if="latest" class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]">
    <button type="button" class="pointer-events-auto flex items-center gap-2 rounded-full bg-forest-700 px-4 py-2 text-sm text-white shadow-lg" @click="reload">
      <UIcon name="i-lucide-refresh-cw" class="size-4" />
      Version {{ latest }} er klar — tryk for at opdatere
    </button>
  </div>
</template>
