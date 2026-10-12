<script setup lang="ts">
// Valuta: et tryk mellem turens lokale valuta og hjemmevalutaen; "Anden" giver et frit felt.
const model = defineModel<string>({ required: true })
const props = withDefaults(defineProps<{ options: string[], size?: 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'xl' })
const opts = computed(() => [...new Set(props.options.filter(Boolean).map(c => c.toUpperCase()))])
const other = ref(!!model.value && !opts.value.includes(model.value.toUpperCase()))
watch(model, v => { if (v && !opts.value.includes(v.toUpperCase())) other.value = true })
function pick(c: string) { other.value = false; model.value = c }
</script>

<template>
  <div class="flex gap-1.5">
    <UButton v-for="c in opts" :key="c" type="button" :size="size" color="neutral" :variant="!other && model?.toUpperCase() === c ? 'solid' : 'soft'"
      :label="c" class="justify-center tabular-nums" @click="pick(c)" />
    <UInput v-if="other" v-model="model" :size="size" class="w-20 uppercase" maxlength="3" autofocus placeholder="EUR" />
    <UButton v-else type="button" :size="size" color="neutral" variant="ghost" icon="i-lucide-ellipsis" square aria-label="Anden valuta" @click="other = true; model = ''" />
  </div>
</template>
