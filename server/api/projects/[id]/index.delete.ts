import { rmSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const id = intParam(event, 'id')
  await requireProject(event, id)
  useDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  rmSync(join(uploadsDir(), String(id)), { recursive: true, force: true })
  return { ok: true }
})
