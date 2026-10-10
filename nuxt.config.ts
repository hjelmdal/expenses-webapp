const isDev = process.argv.includes('dev')

// Expenses — udlæg og overblik pr. tur/projekt. Standalone Nuxt: Nitro er
// backenden, data ligger i SQLite (node:sqlite) under ./data (uden for .output).
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  // Native-agtige sideskift (se app/plugins/nav-direction.client.ts + main.css).
  // Browsere uden View Transitions skifter bare side uden animation.
  experimental: { viewTransition: true },
  // Egen build-mappe til testserveren, så den ikke deler .nuxt (og dev-låsen)
  // med manager'ens dev-server og vælter den — det fik dev-PWA'en til at genindlæse.
  buildDir: process.env.EXPENSES_BUILD_DIR || '.nuxt',
  devtools: { enabled: false },
  app: {
    head: {
      title: 'Udlæg',
      htmlAttrs: { lang: 'da' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#18181b', media: '(prefers-color-scheme: dark)' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Udlæg' },
      ],
      // Appen kører altid i roden af sin egen host (dev-expenses / expenses-app),
      // så /brand/ er korrekt her. /brand/* er undtaget fra Access (PWA-ikoner).
      link: [
        { rel: 'icon', href: '/brand/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/brand/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
        { rel: 'manifest', href: '/brand/manifest.webmanifest' },
      ],
    },
  },
  runtimeConfig: {
    // Data-mappen (db + kvitteringer), relativ til appens rod. Dev og prod har
    // hver sin, så afprøvning i dev aldrig rører rigtige udlæg.
    // EXPENSES_DATA_DIR: kun til Claudes isolerede testserver (se CLAUDE.md).
    dataDir: process.env.EXPENSES_DATA_DIR || (isDev ? './data/dev' : './data/prod'),
    // Cloudflare Access-teamet, hvis JWT verificeres (identitet).
    accessTeam: 'hjelmdal',
    // Kun lokal dev uden Access foran: falder tilbage til denne bruger.
    devUser: '',
    claudeBin: '/opt/homebrew/bin/claude',
  },
  vite: {
    server: { allowedHosts: ['dev-expenses.hjelmdal.dk', 'dev.hjelmdal.dk'] },
  },
})
