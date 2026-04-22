export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore()
  if (authStore.user?.role !== 'hr_admin') {
    return abortNavigation({ statusCode: 403, statusMessage: 'Forbidden' })
  }
})
