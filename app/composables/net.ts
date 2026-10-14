// Forbindelsen set fra appen. Service workeren (sw/sw.js) svarer med de sidst hentede data,
// når nettet svigter, og markerer svaret med x-offline-cache (hvornår det blev hentet) og
// x-needs-login (Access-sessionen er udløbet). NetBanner viser det.
const offlineSince = ref<string | null>(null) // tidspunkt for de viste data, når de kommer fra telefonen
const needsLogin = ref(false)

// Kaldes for hvert svar fra /api (se api()).
export function noteResponse(res: Response) {
  const cached = res.headers.get('x-offline-cache')
  offlineSince.value = cached == null ? null : (cached || new Date(0).toISOString())
  needsLogin.value = res.headers.get('x-needs-login') === '1' || res.status === 401 || res.status === 403
}

// Intet svar og intet gemt: offline, men uden et tidspunkt for de viste data.
export function noteNoResponse() {
  offlineSince.value ??= new Date(0).toISOString()
}

// Fejlede et kald uden svar? Spørg serveren direkte (uden om service workeren) for at skelne
// "intet net" fra "Access vil have et nyt login" (redirect til login-siden).
export async function probeLogin() {
  try {
    const r = await fetch('/api/version', { redirect: 'manual', cache: 'no-store' })
    needsLogin.value = r.type === 'opaqueredirect'
  } catch {}
  return needsLogin.value
}

export function useNet() {
  return { offlineSince, needsLogin }
}
