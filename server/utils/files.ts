import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { MultiPartData } from 'h3'

const MAX_FILES = 6
const MAX_BYTES = 15 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' }

// Gemmer kvitteringsbilleder under uploads/<projekt>/<post>-<tilfældig>.<ext>.
export function saveImages(projectId: number, entryId: number, parts: MultiPartData[]) {
  const db = useDb()
  const have = (db.prepare('SELECT count(*) AS n FROM attachments WHERE entry_id = ?').get(entryId) as any).n
  const images = parts.filter(p => p.name === 'images' && p.data?.length)
  if (have + images.length > MAX_FILES) throw createError({ statusCode: 400, statusMessage: `Højst ${MAX_FILES} billeder pr. post` })
  const dir = join(uploadsDir(), String(projectId))
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const img of images) {
    const mime = (img.type || '').toLowerCase()
    if (!EXT[mime]) throw createError({ statusCode: 400, statusMessage: 'Kun billeder (jpg, png, webp, heic)' })
    if (img.data.length > MAX_BYTES) throw createError({ statusCode: 400, statusMessage: 'Billedet er for stort' })
    const rel = `${projectId}/${entryId}-${randomBytes(6).toString('hex')}.${EXT[mime]}`
    writeFileSync(join(uploadsDir(), rel), img.data)
    db.prepare('INSERT INTO attachments (entry_id, file, mime) VALUES (?, ?, ?)').run(entryId, rel, mime)
    n++
  }
  return n
}

export function deleteFile(rel: string) {
  rmSync(join(uploadsDir(), rel), { force: true })
}

export function fields(parts: MultiPartData[] | undefined) {
  const out: Record<string, string> = {}
  for (const p of parts || []) if (p.name && p.name !== 'images' && !p.filename) out[p.name] = p.data.toString('utf8')
  return out
}
