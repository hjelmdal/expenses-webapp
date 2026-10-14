// Sender ventende kvitteringer/poster fra udbakken (composables/outbox.ts): ved start,
// når nettet kommer tilbage, når appen kommer i forgrunden og hvert 20. sekund.
export default defineNuxtPlugin(() => {
  const { pending, flush } = useOutbox()
  flush()
  window.addEventListener('online', () => flush())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush() })
  setInterval(() => { if (pending.value.some(x => !x.stuck)) flush() }, 20_000)
})
