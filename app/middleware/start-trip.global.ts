// "Start her": er en tur valgt som start på denne enhed, åbner appen direkte på den i stedet
// for turlisten. Kun ved selve opstarten — "tilbage" til listen virker som normalt bagefter.
let decided = false
export default defineNuxtRouteMiddleware((to) => {
  if (decided) return
  decided = true
  if (to.path !== '/') return
  const id = Number(localStorage.getItem(START_TRIP_KEY))
  if (id) return navigateTo(`/p/${id}`, { replace: true })
})
