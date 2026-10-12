<script setup lang="ts">
// Posttype: udgift · rabat · hævning · indtægt · depositum.
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ change: [kind: string] }>()
const kinds = ['expense', 'credit', 'withdrawal', 'income', 'deposit']
</script>

<template>
  <div class="grid grid-cols-5 gap-0.5 rounded-lg bg-elevated p-1 text-[13px] tracking-tight">
    <button v-for="k in kinds" :key="k" type="button" class="rounded-md py-1.5"
      :class="model === k ? 'bg-default font-medium shadow-sm' : 'text-muted'"
      @click="model = k; emit('change', k)">{{ KIND_LABEL[k] }}</button>
  </div>
</template>
