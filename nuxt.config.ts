import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const isDev = process.argv.includes('dev')
// iOS-opstartsbilleder pr. skærmstørrelse (laves af scripts/brand.sh).
const startupSizes: { w: number, h: number, r: number }[] = JSON.parse(readFileSync('scripts/startup-sizes.json', 'utf8'))
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
        // iOS henter selv sit opstartsbillede — de 7 store billeder skal ikke med i cachen.
        .filter(f => !f.includes('/splash/startup-'))
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
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Udlæg' },
      ],
      // Appen kører altid i roden af sin egen host (dev-expenses / expenses-app),
      // så /brand/ er korrekt her. /brand/* er undtaget fra Access (PWA-ikoner).
      // Opstartsskærm: kun i den installerede app (en browserfane skal ikke vente på den).
      // Gaten SKAL køre i <head> før første optegning. ?splash=1 tvinger den frem til test.
      // Statuslinjen farves efter theme-color. Den sættes HER og ikke i meta nedenfor: Nuxts
      // head-styring ville ellers overtage splashens ekstra tag ved hydrering og efterlade den
      // mørke farve i lys tilstand. Så længe splashen vises, står splashens øverste farve
      // FØRST (det første, der matcher, vinder) — ellers en lys stribe over den mørke splash.
      // Flyet er et <img> (ikke CSS-baggrund — iOS afspiller ikke SVG-animationen dér), lagt
      // direkte i <html>, da <body> ikke findes endnu.
      // __splashDone() toner ud og giver statuslinjen tilbage. Loft: 3 s. Gulvet: app.vue.
      script: [{
        innerHTML: `try{var d=document.documentElement,h=document.head,t=function(c,q){var m=document.createElement('meta');m.name='theme-color';m.content=c;if(q)m.media=q;h.appendChild(m);return m};t('#f5f6f9','(prefers-color-scheme: light)');t('#161a29','(prefers-color-scheme: dark)');if(matchMedia('(display-mode: standalone)').matches||navigator.standalone||/[?&]splash=1/.test(location.search)){d.dataset.pwa='1';var m=t('#0d3245');h.insertBefore(m,h.firstChild);var p=new Image();p.className='splash-plane';p.alt='';p.src='/brand/splash/flight.svg';d.appendChild(p);window.__splashDone=function(){d.classList.add('splash-done');m.remove();setTimeout(function(){p.remove()},400)};setTimeout(window.__splashDone,3000)}}catch(e){}`,
        tagPosition: 'head',
      }],
      style: [{ innerHTML: readFileSync('app/assets/splash.css', 'utf8') }],
      link: [
        { rel: 'icon', href: '/brand/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/brand/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
        { rel: 'manifest', href: '/brand/manifest.webmanifest' },
        // iOS viser ellers sort, til siden er indlæst. Ét billede pr. skærm; kun højformat.
        ...startupSizes.map(x => ({
          rel: 'apple-touch-startup-image',
          media: `screen and (device-width: ${x.w}px) and (device-height: ${x.h}px) and (-webkit-device-pixel-ratio: ${x.r}) and (orientation: portrait)`,
          href: `/brand/splash/startup-${x.w * x.r}x${x.h * x.r}.jpg`,
        })),
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
