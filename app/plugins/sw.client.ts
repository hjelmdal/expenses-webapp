// Service worker (sw/sw.js): appen åbner og viser de senest hentede data uden net.
// Kun i det byggede prod — dev har ingen service worker.
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
})
