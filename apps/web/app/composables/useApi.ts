/**
 * Gedeelde API-fetcher (AUTH-0008).
 *
 * - Zet `Authorization: Bearer <access_token>` automatisch.
 * - Intercept 401 `token_expired`: probeert één keer stille refresh,
 *   herhaalt de call. Tweede 401 → redirect /login.
 * - Verwijdert de Sprint-1 x-tenant-id / x-user-id headers — tenant-context
 *   loopt nu via het JWT-claim (ADR-0006, AUTH-0008).
 * - Server-state gebruikt altijd DIT, nooit useFetch/fetch direct.
 */
export function useApi() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const router = useRouter()

  return $fetch.create({
    baseURL: config.public.apiBase as string,
    credentials: 'include',

    onRequest({ options }) {
      if (authStore.accessToken) {
        const headers = new Headers(options.headers as HeadersInit | undefined)
        headers.set('Authorization', `Bearer ${authStore.accessToken}`)
        options.headers = headers
      }
    },

    async onResponseError({ request, options, response }) {
      const problem = response._data as { error?: string } | undefined

      // 401 token_expired → probeer stille refresh, retry éénmaal
      if (response.status === 401 && problem?.error === 'token_expired') {
        const ok = await authStore.refresh()
        if (ok) {
          // Retry — nieuwe instantie van de fetcher om type-inferentie te omzeilen
          try {
            const retryHeaders = new Headers(options.headers as HeadersInit | undefined)
            if (authStore.accessToken) {
              retryHeaders.set('Authorization', `Bearer ${authStore.accessToken}`)
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await $fetch(request as string, { ...options, headers: retryHeaders } as any)
            // Retry geslaagd — gooi geen error
            return
          }
          catch {
            // Retry ook mislukt — val door naar redirect
          }
        }
        // Refresh mislukt of tweede 401 → uitloggen en naar /login
        authStore._clear()
        await router.push('/login')
        return
      }

      // Alle andere errors: omzetten in typed Error voor Colada
      const err = new Error(
        (response._data as { title?: string } | undefined)?.title ?? 'API-fout',
      ) as Error & { statusCode?: number; problem?: unknown }
      err.statusCode = response.status
      err.problem = response._data
      throw err
    },
  })
}
