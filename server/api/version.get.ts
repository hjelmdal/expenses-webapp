// Den version serveren kører — klienten sammenligner med sin egen for at opdage en ny udgave.
export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'no-store')
  return { version: String(useRuntimeConfig().public.version) }
})
