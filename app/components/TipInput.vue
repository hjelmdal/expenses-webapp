<script setup lang="ts">
// Drikkepenge + om de blev betalt kontant (relevant når resten er kort/regning).
const tip = defineModel<string | number>('tip', { required: true })
const tipCash = defineModel<boolean>('tipCash', { required: true })
defineProps<{ method: string, label?: string }>()
</script>

<template>
  <div>
    <UFormField :label="label || 'Heraf drikkepenge'">
      <UInput v-model="tip" inputmode="decimal" class="w-full" placeholder="0" />
    </UFormField>
    <label v-if="method !== 'cash' && Number(String(tip).replace(',', '.')) > 0" class="mt-2 flex items-center gap-2 text-sm">
      <USwitch v-model="tipCash" />
      Drikkepenge betalt kontant
    </label>
  </div>
</template>
