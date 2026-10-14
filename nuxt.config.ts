import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const isDev = process.argv.includes('dev')
// Version = 1.<antal commits>, regnet ved build — tæller selv op for hvert commit, der
// bygges til prod. Klienten sammenligner sin version med serverens (plugins/version.client.ts).
const version = isDev ? 'dev' : (() => {
  try { return `1.${execSync('git rev-list --count HEAD').toString().trim()}` } catch { return '1.0' }
})()

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
  // Ikonerne bundtes i appen, så de også vises offline (ellers hentes de fra serveren).
  icon: { clientBundle: { scan: true } },
  // Testserverens prod-build lægges i sin egen mappe, så den ikke overskriver prods .output.
  nitro: process.env.EXPENSES_OUTPUT_DIR ? { output: { dir: process.env.EXPENSES_OUTPUT_DIR } } : {},
  // Service workeren må ikke caches (heller ikke af Cloudflare), ellers kommer en ny version først sent ud.
  routeRules: { '/sw.js': { headers: { 'cache-control': 'no-cache' } } },
  hooks: {
    // Service worker (sw/sw.js) får versionen og listen over byggede filer, så appen kan åbne
    // uden net. Kun ved build — dev har ingen service worker.
    'nitro:build:public-assets'(nitro) {
      const dir = nitro.options.output.publicDir
      const files = ['_nuxt', 'brand'].flatMap(d => readdirSync(join(dir, d), { recursive: true, withFileTypes: true })
        .filter(f => f.isFile()).map(f => '/' + relative(dir, join(f.parentPath, f.name))))
      const sw = readFileSync('sw/sw.js', 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(files))
      writeFileSync(join(dir, 'sw.js'), sw)
    },
  },
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
    public: { version },
  },
  vite: {
    server: { allowedHosts: ['dev-expenses.hjelmdal.dk', 'dev.hjelmdal.dk'] },
  },
})
