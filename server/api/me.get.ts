export default defineEventHandler(async event => ({ email: await requireUser(event) }))
