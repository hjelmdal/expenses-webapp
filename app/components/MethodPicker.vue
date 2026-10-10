<script setup lang="ts">
// Betalingsmåde: kort · kontant · (hotel)regning · delvist (rest betales senere). Regning/senere kan slås fra.
const model = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{ room?: boolean, later?: boolean, size?: 'sm' | 'md' }>(), { room: true, later: false, size: 'md' })
const options = computed(() => [
  { value: 'card', label: 'Kort', icon: 'i-lucide-credit-card' },
  { value: 'cash', label: 'Kontant', icon: 'i-lucide-banknote' },
  ...(props.room ? [{ value: 'room', label: 'Regning', icon: 'i-lucide-hotel' }] : []),
  ...(props.later ? [{ value: 'later', label: 'Delvist', icon: 'i-lucide-clock' }] : []),
])
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton v-for="o in options" :key="o.value" type="button" :size="size" :variant="model === o.value ? 'solid' : 'soft'" color="neutral"
      :icon="o.icon" :label="o.label" @click="model = o.value" />
  </div>
</template>
