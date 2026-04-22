/**
 * auth.global — AUTH-0007
 *
 * Loopt op elke navigatie (SSR en client-side).
 *
 * SSR-volgorde:
 *   1. restore() roept POST /v1/auth/refresh aan (httpOnly-cookie gaat mee).
 *   2. Als dat lukt: user is ingelogd; ga door.
 *   3. Als dat mislukt en route is niet public: redirect /login?redirect=<pad>.
 *
 * Client-side:
 *   - _restored is al true na SSR — restore() is een no-op.
 *   - De isAuthenticated-check beschermt daarna elke client-navigatie.
 *
 * Routes die geen auth vereisen: `definePageMeta({ public: true })`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  // SSR: probeer stille refresh éénmaal
  if (!authStore._restored) {
    await authStore.restore()
  }

  const isPublic = to.meta.public === true

  // Ingelogde gebruiker op /login → stuur door naar redirect of /
  if (authStore.isAuthenticated && to.path === '/login') {
    const redirect = (to.query.redirect as string | undefined) ?? '/'
    return navigateTo(redirect)
  }

  // Niet-ingelogde gebruiker op beveiligde route → naar /login
  if (!authStore.isAuthenticated && !isPublic) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
