// Små felter (size xs/sm) har 14 px tekst i Nuxt UI — så zoomer iOS ind, når man trykker i dem.
// På telefon får de 16 px (som de større størrelser allerede har), og først på større skærme 14 px.
const noZoom = { variants: { size: { xs: { base: 'text-base/5 md:text-xs' }, sm: { base: 'text-base/5 md:text-sm/4' } } } }

export default defineAppConfig({
  ui: {
    colors: { primary: 'forest', success: 'forest', error: 'coral', warning: 'amber', info: 'iris', neutral: 'ink' },
    input: noZoom,
    textarea: noZoom,
  },
})
