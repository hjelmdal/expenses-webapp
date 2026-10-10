<script setup lang="ts">
// Lys / mørk / følg telefonen. Huskes på enheden (color-mode gemmer i localStorage).
const mode = useColorMode()
const options = [
  { value: 'system', label: 'Auto', icon: 'i-lucide-smartphone' },
  { value: 'light', label: 'Lys', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Mørk', icon: 'i-lucide-moon' },
]
</script>

<template>
  <div class="grid grid-cols-3 gap-1 rounded-lg bg-elevated p-1 text-sm">
    <button v-for="o in options" :key="o.value" type="button" class="flex items-center justify-center gap-1.5 rounded-md py-1.5"
      :class="mode.preference === o.value ? 'bg-default font-medium shadow-sm' : 'text-muted'" @click="mode.preference = o.value">
      <UIcon :name="o.icon" class="size-4" />{{ o.label }}
    </button>
  </div>
</template>
