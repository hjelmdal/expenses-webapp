export default defineEventHandler(async (event) => {
  const email = await requireUser(event)
  return useDb().prepare(`
    SELECT p.*, (SELECT count(*) FROM entries e WHERE e.project_id = p.id) AS entry_count,
      (SELECT max(occurred_at) FROM entries e WHERE e.project_id = p.id) AS last_at
    FROM projects p JOIN members m ON m.project_id = p.id
    WHERE m.email = ? ORDER BY p.archived, coalesce(last_at, p.created_at) DESC`).all(email)
})
