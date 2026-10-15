<script setup lang="ts">
// Opstartsskærmen (app/assets/splash.css) toner ud, når appen er klar — men tidligst efter
// et gulv, så den ikke blinker forbi, når alt kommer fra cachen. Gulvet måles fra
// navigationens start: en langsom opstart gøres aldrig langsommere.
const SPLASH_FLOOR_MS = 1200
onMounted(() => {
  const done = (window as any).__splashDone // sat af head-scriptet i nuxt.config.ts — kun når splashen vises
  if (!done) return
  setTimeout(() => requestAnimationFrame(done), Math.max(0, SPLASH_FLOOR_MS - performance.now()))
})
</script>

<template>
  <UApp>
    <NuxtPage />
    <UpdateBanner />
    <NetBanner />
  </UApp>
</template>
