import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Kvitteringsaflæsning via den lokale Claude CLI (`claude -p`), samme mønster
// som Compass' Fellow-høster — ingen API-nøgle. Én aflæsning ad gangen; posten
// er gemt FØR aflæsningen, så intet går tabt, hvis den fejler.
const queue: number[] = []
let running = false

export function queueReceipt(entryId: number) {
  useDb().prepare(`UPDATE entries SET status = 'reading', ai_note = NULL WHERE id = ?`).run(entryId)
  if (!queue.includes(entryId)) queue.push(entryId)
  void pump()
}

// Ved opstart: poster der stod og ventede, da processen døde, sættes i kø igen.
export function resumeReceipts() {
  const rows = useDb().prepare(`SELECT id FROM entries WHERE status = 'reading'`).all() as any[]
  for (const r of rows) queueReceipt(r.id)
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const id = queue.shift()!
      try { await readOne(id) } catch (err: any) {
        useDb().prepare(`UPDATE entries SET status = 'failed', ai_note = ? WHERE id = ?`)
          .run(String(err?.message || err).slice(0, 500), id)
      }
    }
  } finally { running = false }
}

const PROMPT = (files: string[]) => `Du aflæser kvitteringer til et udlægssystem. Læs billedfilerne med Read-værktøjet:
${files.map(f => '- ' + f).join('\n')}

Billederne hører til ÉN post (fx regning + kortkvittering, eller flere sider af samme regning).
Svar KUN med ét JSON-objekt, ingen anden tekst:
{
  "kind": "expense" | "credit" | "withdrawal" | "income" | "deposit",   // "withdrawal" ved ATM-kvittering; "deposit" ved depositum/security deposit/pre-authorization der skal komme retur; "credit" hvis HELE bilaget er en rabat/credit/kompensation/refusion, der trækkes fra (fx hotel-credit, afslag efter klage) — ikke en almindelig regning med en rabatlinje
  "merchant": string | null,                       // sted/forretning. Er navnet skåret af/ulæseligt: brug det bedste du har, fx "Restaurant, Koh Yao" ud fra adressen
  "description": string | null,                    // kort dansk beskrivelse af hvad det dækker, fx "Aftensmad, 5 retter + drikke"
  "date": "YYYY-MM-DD" | null,
  "currency": "ISO-4217" | null,                   // fx THB, DKK, EUR
  "total": number | null,                          // det endelige beløb der blev BETALT, inkl. drikkepenge. Ved "credit": rabattens størrelse som positivt tal
  "tip": number | null,                            // drikkepenge/tip — ofte HÅNDSKREVET på kortkvitteringen. Ikke service charge.
  "service_charge": number | null,                 // trykt service charge / service fee (fx 10 %). Er IKKE tip — tip er det kunden selv giver
  "fee": number | null,                            // ATM-/bankgebyr på hævninger
  "method": "card" | "cash" | "room" | null,       // KUN ud fra tydelige tegn: "room" hvis værelsesnr./underskrift faktisk er UDFYLDT eller der står "charge to room"; "card" ved kortkvittering/kortnummer; "cash" hvis der står kontant/change. Tomme fortrykte felter (Room No ...., Signature ....) betyder IKKE room. I tvivl: null
  "category": string | null,                       // udgiftens kategori — én af nøglerne nedenfor
  "note": string | null                            // kort note hvis noget er usikkert eller ulæseligt
}
Kategorier (brug nøglen): ${CATEGORIES.map(c => `${c.key} = ${c.label} (${c.hint})`).join('; ')}.
Regler: Hvis der er en håndskrevet tip og et håndskrevet total, så brug det håndskrevne total. Hvis kun tip er håndskrevet, så total = trykt beløb + tip.
Beløb som tal uden tusindtalsseparator (1250.5). Gæt ikke — brug null, hvis du ikke kan læse det.`

async function readOne(entryId: number) {
  const db = useDb()
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any
  if (!entry) return
  const files = (db.prepare('SELECT file FROM attachments WHERE entry_id = ? ORDER BY id').all(entryId) as any[])
    .map(a => join(uploadsDir(), a.file))
  if (!files.length) {
    db.prepare(`UPDATE entries SET status = 'ready' WHERE id = ?`).run(entryId)
    return
  }
  const out = await runClaude(PROMPT(files))
  const json = extractJson(out)
  if (!json) throw new Error('Kunne ikke tolke svaret fra aflæsningen')

  // Felter brugeren allerede har udfyldt, overskrives ikke — kun de tomme fyldes.
  const fresh = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any
  if (!fresh) return
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : (v != null && isFinite(Number(v)) ? Number(v) : null))
  const total = num(json.total)
  const upd: Record<string, any> = {}
  if (fresh.amount == null && total != null) upd.amount = total
  if (!fresh.tip && num(json.tip)) upd.tip = num(json.tip)
  if (!fresh.service && num(json.service_charge)) upd.service = num(json.service_charge)
  if (!fresh.category && CATEGORY_KEYS.includes(json.category)) upd.category = json.category
  if (!fresh.merchant && json.merchant) upd.merchant = String(json.merchant).slice(0, 200)
  if (!fresh.description && json.description) upd.description = String(json.description).slice(0, 500)
  if (json.currency && /^[A-Z]{3}$/.test(json.currency) && fresh.amount == null) upd.currency = json.currency
  if (json.date && /^\d{4}-\d{2}-\d{2}$/.test(json.date) && fresh.amount == null) upd.occurred_at = json.date
  if (['card', 'cash', 'room'].includes(json.method) && fresh.amount == null && fresh.kind === 'expense') upd.method = json.method
  if (json.kind === 'credit' && fresh.kind === 'expense' && fresh.amount == null) { upd.kind = 'credit'; upd.tip = 0; upd.service = 0; if (upd.amount != null) upd.amount = Math.abs(upd.amount) }
  if (json.kind === 'deposit' && fresh.kind === 'expense' && fresh.amount == null) { upd.kind = 'deposit'; upd.method = json.method === 'cash' ? 'cash' : 'card' }
  if (json.kind === 'withdrawal' && fresh.kind === 'expense' && fresh.amount == null) { upd.kind = 'withdrawal'; upd.method = 'cash' }
  const notes = [json.note, num(json.fee) ? `Gebyr: ${json.fee}` : null].filter(Boolean)
  upd.ai_note = notes.length ? notes.join(' · ').slice(0, 500) : null
  upd.status = 'ready'
  const keys = Object.keys(upd)
  db.prepare(`UPDATE entries SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map(k => upd[k]), entryId)
  if (!fresh.category && !upd.category) queueCategorize(entryId)
}

export function runClaude(prompt: string, opts: { model?: string, read?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = useRuntimeConfig().claudeBin as string
    const args = ['-p', '--model', opts.model || 'sonnet', '--output-format', 'json']
    if (opts.read !== false) args.push('--allowedTools', 'Read', '--add-dir', uploadsDir())
    else args.push('--tools', '')
    const ch = spawn(bin, args, {
      cwd: uploadsDir(),
      env: { ...process.env, HOME: process.env.HOME || '/Users/remote', PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = '', err = ''
    const timer = setTimeout(() => { ch.kill('SIGKILL'); reject(new Error('Aflæsningen tog for lang tid')) }, 180_000)
    ch.stdout.on('data', d => { out += d })
    ch.stderr.on('data', d => { err += d })
    ch.on('error', e => { clearTimeout(timer); reject(e) })
    ch.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`claude afsluttede med ${code}: ${(err || out).slice(-300)}`))
      try {
        const res = JSON.parse(out)
        if (res.is_error) return reject(new Error(String(res.result || 'fejl').slice(0, 300)))
        resolve(String(res.result || ''))
      } catch { resolve(out) }
    })
    ch.stdin.end(prompt)
  })
}

function extractJson(s: string): any {
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1).replace(/\/\/[^\n"]*$/gm, '')) } catch { return null }
}
