<script setup lang="ts">
// Drikkepenge oveni beløbet + om de blev givet kontant (relevant når resten er kort/regning).
// Viser det betalte i alt, så både beløbet med og uden tips står der.
const tip = defineModel<string | number>('tip', { required: true })
const tipCash = defineModel<boolean>('tipCash', { required: true })
defineProps<{ method: string, total?: number | null, currency?: string }>()
</script>

<template>
  <div>
    <UFormField label="Tilføj drikkepenge">
      <UInput v-model="tip" inputmode="decimal" class="w-full" placeholder="0" />
    </UFormField>
    <template v-if="parseAmount(tip) > 0">
      <p v-if="total != null && currency" class="mt-1 text-xs text-muted">I alt betalt <span class="font-medium tabular-nums text-highlighted">{{ money(total, currency) }}</span></p>
      <label v-if="method !== 'cash'" class="mt-2 flex items-center gap-2 text-sm">
        <USwitch v-model="tipCash" />
        Drikkepenge givet kontant
      </label>
    </template>
  </div>
</template>
