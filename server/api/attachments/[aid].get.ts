import { createReadStream } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const aid = intParam(event, 'aid')
  const a = useDb().prepare('SELECT * FROM attachments WHERE id = ?').get(aid) as any
  if (!a) throw createError({ statusCode: 404 })
  await requireEntry(event, a.entry_id)
  setHeader(event, 'content-type', a.mime)
  setHeader(event, 'cache-control', 'private, max-age=86400')
  return sendStream(event, createReadStream(join(uploadsDir(), a.file)))
})
