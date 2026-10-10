export default defineNitroPlugin(() => {
  useDb()
  resumeReceipts()
  backfillCategories()
})
