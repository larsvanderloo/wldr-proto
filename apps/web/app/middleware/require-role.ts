export default defineNuxtRouteMiddleware(() => {
  const session = useSessionStore()
  if (session.role !== 'admin') {
    return abortNavigation({ statusCode: 403, statusMessage: 'Forbidden' })
  }
})
