/**
 * Unit tests voor de middleware-logica van auth.global (F4 — AUTH-0007)
 *
 * Strategie: test de beslislogica direct (geen Nuxt-router-instantie nodig).
 * De middleware zelf is een thin wrapper; we testen de condities.
 *
 * Test-scope:
 *  - Niet-ingelogde bezoeker op beveiligde route → redirect /login?redirect=<pad>
 *  - Niet-ingelogde bezoeker op publieke route → geen redirect
 *  - Ingelogde gebruiker op /login → redirect naar /
 *  - Ingelogde gebruiker op /login met redirect-param → redirect naar param
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// navigateTo en useAuthStore zijn Nuxt auto-imports — mock ze globaal
const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)

// Hulpfunctie: simuleer de middleware-logica
// (extract van auth.global.ts — houd synchroon met de implementatie)
async function runMiddlewareLogic(
  authStore: {
    _restored: boolean
    isAuthenticated: boolean
    restore: () => Promise<boolean>
  },
  to: {
    path: string
    fullPath: string
    meta: Record<string, unknown>
    query: Record<string, string>
  },
) {
  if (!authStore._restored) {
    await authStore.restore()
  }

  const isPublic = to.meta['public'] === true

  if (authStore.isAuthenticated && to.path === '/login') {
    const redirect = to.query['redirect'] ?? '/'
    return mockNavigateTo(redirect)
  }

  if (!authStore.isAuthenticated && !isPublic) {
    return mockNavigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
}

function makeStore(overrides: Partial<{
  _restored: boolean
  isAuthenticated: boolean
}> = {}) {
  return {
    _restored: false,
    isAuthenticated: false,
    restore: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
}

function makeRoute(
  path: string,
  meta: Record<string, unknown> = {},
  query: Record<string, string> = {},
) {
  const qs = new URLSearchParams(query).toString()
  return { path, fullPath: path + (qs ? '?' + qs : ''), meta, query }
}

describe('auth.global middleware logica', () => {
  beforeEach(() => {
    mockNavigateTo.mockReset()
  })

  it('niet-ingelogde bezoeker op beveiligde route → redirect naar /login met redirect-param', async () => {
    const store = makeStore({ _restored: false, isAuthenticated: false })

    await runMiddlewareLogic(store, makeRoute('/employees'))

    expect(mockNavigateTo).toHaveBeenCalledWith('/login?redirect=%2Femployees')
  })

  it('niet-ingelogde bezoeker op publieke route → geen redirect', async () => {
    const store = makeStore({ _restored: true, isAuthenticated: false })

    await runMiddlewareLogic(store, makeRoute('/login', { public: true }))

    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('ingelogde gebruiker op /login zonder redirect-param → redirect naar /', async () => {
    const store = makeStore({ _restored: true, isAuthenticated: true })

    await runMiddlewareLogic(store, makeRoute('/login', { public: true }))

    expect(mockNavigateTo).toHaveBeenCalledWith('/')
  })

  it('ingelogde gebruiker op /login met redirect-param → redirect naar param', async () => {
    const store = makeStore({ _restored: true, isAuthenticated: true })

    await runMiddlewareLogic(
      store,
      makeRoute('/login', { public: true }, { redirect: '/employees' }),
    )

    expect(mockNavigateTo).toHaveBeenCalledWith('/employees')
  })

  it('restore() wordt niet nogmaals aangeroepen als _restored al true is', async () => {
    const store = makeStore({ _restored: true, isAuthenticated: true })

    await runMiddlewareLogic(store, makeRoute('/employees'))

    expect(store.restore).not.toHaveBeenCalled()
  })
})
