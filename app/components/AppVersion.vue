<script setup lang="ts">
// Den version, appen er indlæst med — så man kan se, om telefonen kører den nyeste.
const version = useRuntimeConfig().public.version
</script>

<template>
  <p class="text-center text-xs text-dimmed tabular-nums">Udlæg {{ version === 'dev' ? 'dev' : `v${version}` }}</p>
</template>
