<script setup lang="ts">
// Betalingsmåde: kort · kontant · (hotel)regning. Regning kan slås fra (fx ved afregning).
const model = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{ room?: boolean, size?: 'sm' | 'md' }>(), { room: true, size: 'md' })
const options = computed(() => [
  { value: 'card', label: 'Kort', icon: 'i-lucide-credit-card' },
  { value: 'cash', label: 'Kontant', icon: 'i-lucide-banknote' },
  ...(props.room ? [{ value: 'room', label: 'Regning', icon: 'i-lucide-hotel' }] : []),
])
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton v-for="o in options" :key="o.value" type="button" :size="size" :variant="model === o.value ? 'solid' : 'soft'" color="neutral"
      :icon="o.icon" :label="o.label" @click="model = o.value" />
  </div>
</template>
