// Ny version i prod? En PWA på telefonen kan leve i dagevis med den gamle kode i hukommelsen.
// Når appen kommer i forgrunden (og hvert 5. minut), spørges serverens version. Er den ny,
// vises et banner (UpdateBanner), og næste sideskift indlæser siden helt — så intet halvt
// udfyldt formular går tabt midt i en indtastning.
export default defineNuxtPlugin(() => {
  const current = String(useRuntimeConfig().public.version)
  const latest = useState<string | null>('latest-version', () => null)
  if (current === 'dev') return
  let last = 0
  async function check() {
    if (Date.now() - last < 30_000) return
    last = Date.now()
    try {
      const r = await $fetch<{ version: string }>('/api/version')
      if (r.version && String(r.version) !== current) latest.value = String(r.version)
    } catch {}
  }
  check()
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
  setInterval(() => { if (document.visibilityState === 'visible') check() }, 5 * 60_000)
  useRouter().beforeEach((to) => {
    if (!latest.value) return
    window.location.assign(to.fullPath)
    return false
  })
})
