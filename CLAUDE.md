# Udlæg (expenses) — arbejdsregler for Claude

Udlæg og overblik pr. tur/projekt. Startet 2026-10-10 under en familietur i Thailand:
input skal være lynhurtigt (foto eller beløb), alt andet kan ordnes bagefter.

- **Stack:** standalone Nuxt 4 + Nuxt UI, Nitro er backenden, `node:sqlite` (ingen native build).
- **Platform:** `dev-expenses.hjelmdal.dk` (dev 3213) / `expenses-app.hjelmdal.dk` (prod 4013),
  styret af manageren i `~/ops` — se `~/ops/HOME-SERVER.md`.
- **Data:** `data/dev/` og `data/prod/` (git-ignored) — hver sin `expenses.db` + `uploads/`.
  Dev rører aldrig prod-data. Prod er med i den natlige backup (`~/ops/platform/backup.sh`).

## Model
`projects` → `members` (e-mails med adgang) · `participants` (dem der deler, med standard-vægt)
· `entries` (kind: expense | withdrawal | income) → `attachments` (kvitteringsbilleder).
- `amount` er det betalte i alt **inkl.** `tip`. UI'et viser drikkepenge **oveni**: feltet "Beløb" = regningen
  (amount − tip), "Tilføj drikkepenge" ved siden af, og listen viser begge ("9.500 + 1.000 drikkepenge"). `split` er JSON (`equal` + pids, eller `weights`
  + shares); NULL = "ikke fordelt endnu".
- `stays` (hoteller) deler hotelregningen op: regningsposter og depositum placeres ud fra datoen
  (`server/utils/stays.ts`; skiftedag = hotellet man forlader, indtil dets regning er betalt), eller
  efter `entries.stay_id`, som man kan vælge på posten, og som låses ved betaling.
- Kurs beregnes ved læsning (`server/utils/ledger.ts`): fast (`base_amount` sat, fx hævning) →
  kontantkurs (sum af hævningers DKK / THB) for kontantposter → ECB-markedskurs (frankfurter.dev,
  cachet pr. dag i `rates`).

## Udbakke (aldrig miste en kvittering)
Nye kvitteringer, ekstra billeder og manuelle poster gemmes i telefonens IndexedDB (`app/composables/outbox.ts`)
FØR de sendes, og slettes først ved et OK fra serveren. Svigter nettet, sendes de igen automatisk
(`app/plugins/outbox.client.ts`), og forsiden viser "N venter på at blive sendt". Serveren genkender
en post på `client_id`, så et nyt forsøg efter et tabt svar ikke giver en dobbeltpost.

**Offline:** en service worker (`sw/sw.js`, bygges til `.output/public/sw.js` med version og fil-liste af
hooket i `nuxt.config.ts`) gør, at appen åbner uden net: sider og `/_nuxt/` fra cachen, GET `/api/` net
først og ellers sidst hentede svar (`x-offline-cache`), som `NetBanner` viser som "Offline · data fra kl. …".
Udløbet Access-login (redirect/401/403) giver "Log ind igen", og udbakken venter i stedet for at droppe
posten. Kun i det byggede prod — dev har ingen service worker. Rettelser kræver stadig net.

## Kvitteringsaflæsning
`server/utils/receipt.ts` kører den lokale **`claude -p --model sonnet --allowedTools Read`** på
billederne — ingen API-nøgle. Posten gemmes FØR aflæsning (status `reading`), én ad gangen,
og aflæsningen udfylder kun tomme felter. Hænger der poster i `reading` ved genstart, sættes de i kø igen.

## Sikkerhed
- Identitet = Cloudflare Access-JWT (`Cf-Access-Jwt-Assertion`), verificeret mod teamets nøgler
  (`server/utils/auth.ts`). Ingen JWT → 401 (undtagen `NUXT_DEV_USER` i lokal `nuxt dev`).
- Adgang til en tur = medlem i `members`. Billeder serveres kun via `/api/attachments/:id` med samme tjek.
- **Venner:** giv adgang med en dedikeret Access-app på `expenses-app.hjelmdal.dk` — udvid aldrig
  `*-app`-wildcard-policyen (den gater også HomeApp og journal).
- `public/brand/` er offentligt (Access-bypass) — kun ikoner/manifest der.

## Test uden at vælte dev
Start ALDRIG en ekstra `nuxt dev` i mappen, og dræb ikke manager'ens dev-server (3213). Den deler
`.nuxt` og dev-låsen, så dev går ned, og dev-PWA'en på telefonen genindlæser igen og igen. Brug en
isoleret testserver med egen build-mappe, egne data og egen port:

```bash
EXPENSES_BUILD_DIR=.nuxt-test EXPENSES_DATA_DIR=<scratch>/testdata NUXT_DEV_USER=test@example.com \
  NUXT_IGNORE_LOCK=1 node node_modules/nuxt/bin/nuxt.mjs dev --host 127.0.0.1 --port 3299
```
Ryd `.nuxt-test` op bagefter. Testdata hører aldrig hjemme i `data/dev` (SHN bruger dev).

## Deploy
Prod kører det byggede `.output`. `pnpm build` bygger i `.nuxt-build`, så det ikke støder ind i
dev-serverens `.nuxt`/lås (et build i `.nuxt` fejler, mens dev kører — og at stoppe dev for at bygge
fik dev-PWA'en til at genindlæse). Genstart så KUN prod-processen; manageren starter den igen efter 2 s:
`kill $(lsof -nP -iTCP:4013 -sTCP:LISTEN -t)`. Undgå `kickstart` af manageren — den tager dev med ned.
**Version:** `1.<antal commits>`, regnet ved build (`nuxt.config.ts`) og vist nederst på forsiden og i
indstillinger. En åben app opdager en nyere server-version (banner + fuld indlæsning ved næste sideskift).
Byg altid prod fra et commit, og meld versionen efter deploy: "v1.N er i prod".
Pakker: `minimumReleaseAge: 4320` i `pnpm-workspace.yaml` (≥ 3 dage gamle).
