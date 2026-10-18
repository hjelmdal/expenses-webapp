// Retning for sideskift, så overgangen kan glide som en iOS-navigationsstak:
// dybere rute = frem (ny side glider ind fra højre), lavere = tilbage (siden
// glider ud til højre). Selve animationen står i main.css (View Transitions).
export default defineNuxtPlugin((nuxtApp) => {
  const depth = (path: string) => path.split('/').filter(Boolean).length
  const d = document.documentElement
  // Ingen overgang under opstarten (fx "start her": turlisten → turen) eller mens splashen
  // vises — View Transitions tager et billede af hele siden, så splashen gled med ind fra højre.
  let started = false
  nuxtApp.hook('app:suspense:resolve', () => { started = true })
  useRouter().beforeEach((to, from) => {
    if (!started || (d.dataset.pwa === '1' && !d.classList.contains('splash-done'))) {
      to.meta.viewTransition = false
      return
    }
    const a = depth(from.path), b = depth(to.path)
    d.dataset.nav = b > a ? 'forward' : b < a ? 'back' : 'fade'
  })
})
