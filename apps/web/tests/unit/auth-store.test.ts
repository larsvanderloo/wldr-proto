/**
 * Unit tests voor useAuthStore (F1 — AUTH-0006)
 *
 * Test-scope:
 *  - login: slaagt → state correct gevuld
 *  - login: mislukt → state onaangetast, error doorgegeven
 *  - refresh: slaagt → nieuwe token in state
 *  - refresh: mislukt → state gewist
 *  - logout: wist altijd state, ook bij netwerk-fout
 *  - restore: roept refresh aan, markeert _restored
 *  - restore: tweede aanroep is no-op
 *
 * Strategie:
 *  - setAuthApiBase() injecteert de base URL zodat useRuntimeConfig niet nodig is
 *  - $fetch wordt via vi.hoisted gemockt
 *  - useCookie: in node-omgeving mocken we de nuxt/app module zodat useCookie
 *    een simpele ref-achtige waarde teruggeeft
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Een geldig JWT met exp in de toekomst
// payload: { sub: "usr-1", tenantId: "ten-1", role: "hr_admin", iat: 1, exp: 9999999999 }
const VALID_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiJ1c3ItMSIsInRlbmFudElkIjoidGVuLTEiLCJyb2xlIjoiaHJfYWRtaW4iLCJpYXQiOjEsImV4cCI6OTk5OTk5OTk5OX0',
  'signature',
].join('.')

const LOGIN_RESPONSE = {
  access_token: VALID_JWT,
  expires_in: 900,
  token_type: 'Bearer' as const,
}

// Mock-functies hoisted vóór imports
const mockFetch = vi.hoisted(() => vi.fn())

vi.stubGlobal('$fetch', mockFetch)

const { useAuthStore, setAuthApiBase, setAuthCsrfGetter } = await import('../../app/stores/auth')

// Injecteer test-waarden zodat Nuxt-composables niet nodig zijn
setAuthApiBase('http://localhost:4000')
setAuthCsrfGetter(() => 'csrf-test')

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockFetch.mockReset()
  })

  describe('login()', () => {
    it('vult accessToken, user en expiresAt bij succesvolle login', async () => {
      mockFetch.mockResolvedValueOnce(LOGIN_RESPONSE)

      const store = useAuthStore()
      await store.login({ email: 'admin@acme.test', password: 'Welkom01!Welkom' })

      expect(store.accessToken).toBe(VALID_JWT)
      expect(store.user).not.toBeNull()
      expect(store.user?.role).toBe('hr_admin')
      expect(store.user?.tenantId).toBe('ten-1')
      expect(store.user?.email).toBe('admin@acme.test')
      expect(store.expiresAt).toBeGreaterThan(Date.now())
      expect(store.isAuthenticated).toBe(true)
    })

    it('gooit de error door bij een mislukte login, state blijft leeg', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Unauthorized'))

      const store = useAuthStore()
      await expect(store.login({ email: 'x@x.nl', password: 'fout' })).rejects.toThrow()

      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('refresh()', () => {
    it('updatet accessToken bij succesvolle refresh', async () => {
      mockFetch.mockResolvedValueOnce(LOGIN_RESPONSE)

      const store = useAuthStore()
      const ok = await store.refresh()

      expect(ok).toBe(true)
      expect(store.accessToken).toBe(VALID_JWT)
      expect(store.user?.role).toBe('hr_admin')
    })

    it('geeft false terug en wist state bij mislukte refresh', async () => {
      mockFetch.mockRejectedValueOnce(new Error('401'))

      const store = useAuthStore()
      store.$patch({
        accessToken: 'oud',
        user: { id: 'u1', email: 'e', role: 'hr_admin', tenantId: 't1' },
      })

      const ok = await store.refresh()

      expect(ok).toBe(false)
      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
    })
  })

  describe('logout()', () => {
    it('wist state na succesvolle logout', async () => {
      const store = useAuthStore()
      store.$patch({
        accessToken: VALID_JWT,
        user: { id: 'u1', email: 'admin@acme.test', role: 'hr_admin', tenantId: 't1' },
        expiresAt: Date.now() + 900_000,
      })
      expect(store.isAuthenticated).toBe(true)

      mockFetch.mockResolvedValueOnce({})
      await store.logout()

      expect(store.isAuthenticated).toBe(false)
      expect(store.accessToken).toBeNull()
    })

    it('wist state ook bij netwerk-fout tijdens logout', async () => {
      const store = useAuthStore()
      store.$patch({
        accessToken: VALID_JWT,
        user: { id: 'u1', email: 'e', role: 'hr_admin', tenantId: 't1' },
      })
      mockFetch.mockRejectedValueOnce(new Error('network error'))

      await store.logout()
      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
    })
  })

  describe('restore()', () => {
    it('roept refresh aan en markeert _restored', async () => {
      mockFetch.mockResolvedValueOnce(LOGIN_RESPONSE)

      const store = useAuthStore()
      expect(store._restored).toBe(false)

      const ok = await store.restore()

      expect(ok).toBe(true)
      expect(store._restored).toBe(true)
      expect(store.isAuthenticated).toBe(true)
    })

    it('tweede restore() aanroep slaat refresh over en geeft isAuthenticated terug', async () => {
      mockFetch.mockResolvedValueOnce(LOGIN_RESPONSE)

      const store = useAuthStore()
      await store.restore() // eerste: markeert _restored + refresh

      const callCountAfterFirst = mockFetch.mock.calls.length
      const ok = await store.restore() // tweede: no-op

      expect(ok).toBe(true)
      expect(mockFetch.mock.calls.length).toBe(callCountAfterFirst)
    })
  })
})
