import type { H3Event } from 'h3'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Identitet kommer fra Cloudflare Access: tokenet i Cf-Access-Jwt-Assertion
// verificeres mod teamets nøgler, så en header sat af andre end Access ikke
// tæller. Audience tjekkes ikke — appen kan ligge bag både wildcard-appen og
// en dedikeret Access-app (venner), og de har hver sin aud.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export async function requireUser(event: H3Event): Promise<string> {
  const cached = event.context.userEmail as string | undefined
  if (cached) return cached
  const cfg = useRuntimeConfig()
  const issuer = `https://${cfg.accessTeam}.cloudflareaccess.com`
  const token = getHeader(event, 'cf-access-jwt-assertion') || getCookie(event, 'CF_Authorization')
  let email = ''
  if (token) {
    jwks ||= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer })
      email = String(payload.email || '').toLowerCase()
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Ugyldigt Access-token' })
    }
  } else if (import.meta.dev && cfg.devUser) {
    email = String(cfg.devUser).toLowerCase()
  }
  if (!email) throw createError({ statusCode: 401, statusMessage: 'Ikke logget ind' })
  event.context.userEmail = email
  return email
}

export async function requireProject(event: H3Event, projectId: number) {
  const email = await requireUser(event)
  const p = useDb().prepare(`SELECT p.* FROM projects p JOIN members m ON m.project_id = p.id
    WHERE p.id = ? AND m.email = ?`).get(projectId, email) as any
  if (!p) throw createError({ statusCode: 404, statusMessage: 'Projekt ikke fundet' })
  return { project: p, email }
}

export async function requireEntry(event: H3Event, entryId: number) {
  const e = useDb().prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any
  if (!e) throw createError({ statusCode: 404, statusMessage: 'Post ikke fundet' })
  const { project, email } = await requireProject(event, e.project_id)
  return { entry: e, project, email }
}

export function intParam(event: H3Event, name: string) {
  const n = Number(getRouterParam(event, name))
  if (!Number.isInteger(n) || n <= 0) throw createError({ statusCode: 400, statusMessage: 'Ugyldigt id' })
  return n
}
