// Retning for sideskift, så overgangen kan glide som en iOS-navigationsstak:
// dybere rute = frem (ny side glider ind fra højre), lavere = tilbage (siden
// glider ud til højre). Selve animationen står i main.css (View Transitions).
export default defineNuxtPlugin(() => {
  const depth = (path: string) => path.split('/').filter(Boolean).length
  useRouter().beforeEach((to, from) => {
    const a = depth(from.path), b = depth(to.path)
    document.documentElement.dataset.nav = b > a ? 'forward' : b < a ? 'back' : 'fade'
  })
})
