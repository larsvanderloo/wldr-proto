/**
 * Unit-tests voor auth-service (zonder DB).
 * Alle DB-calls worden gemockt.
 *
 * Dekt: autorisatie-checks, validatie-fouten, happy-path login-structuur.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de repository — we testen de service-laag in isolatie
vi.mock('../../../../services/auth/repository.js', () => ({
  findTenantByEmailDomain: vi.fn(),
  findTenantBySlug: vi.fn(),
  findUserByEmail: vi.fn(),
  storeRefreshToken: vi.fn(),
  employeeExistsInTenant: vi.fn(),
  userEmailExists: vi.fn(),
  createUser: vi.fn(),
}))

vi.mock('../../../../utils/rate-limit.js', () => ({
  isRateLimited: vi.fn().mockResolvedValue({ blocked: false }),
  recordFailedAttempt: vi.fn().mockResolvedValue({ blocked: false }),
  clearRateLimit: vi.fn().mockResolvedValue(undefined),
}))

import type { AuthContext } from '../../../../types/auth-context.js'

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}

function makeCtx(overrides?: Partial<AuthContext>): AuthContext {
  return {
    ip: '127.0.0.1',
    log: mockLog as unknown as AuthContext['log'],
    user: null,
    ...overrides,
  }
}

describe('auth-service', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-voor-unit-tests-minimaal-32-bytes!'
    process.env.PII_ENCRYPTION_KEY = 'test-pii-key'
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('gooit 403 als de gebruiker geen hr_admin is', async () => {
      const { register } = await import('../../../../services/auth/service.js')
      const ctx = makeCtx({ user: { id: 'u1', tenantId: 't1', role: 'employee' } })

      await expect(
        register(ctx, { email: 'test@acme.nl', password: 'Welkom01!Welkom01!' }),
      ).rejects.toMatchObject({ statusCode: 403, authCode: 'forbidden' })
    })

    it('gooit 403 als er geen ingelogde gebruiker is', async () => {
      const { register } = await import('../../../../services/auth/service.js')
      const ctx = makeCtx({ user: null })

      await expect(
        register(ctx, { email: 'test@acme.nl', password: 'Welkom01!Welkom01!' }),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('gooit 422 als employeeId ontbreekt voor employee-rol', async () => {
      const { register } = await import('../../../../services/auth/service.js')
      const ctx = makeCtx({ user: { id: 'u1', tenantId: 't1', role: 'hr_admin' } })

      const repo = await import('../../../../services/auth/repository.js')
      vi.mocked(repo.userEmailExists).mockResolvedValue(false)

      await expect(
        register(ctx, { email: 'emp@acme.nl', password: 'Welkom01!Welkom01!', role: 'employee' }),
      ).rejects.toMatchObject({ statusCode: 422, authCode: 'missing_employee_id' })
    })
  })

  describe('login - validatie', () => {
    it('gooit 401 bij onbekende email-domein', async () => {
      const { login } = await import('../../../../services/auth/service.js')
      const repo = await import('../../../../services/auth/repository.js')

      vi.mocked(repo.findTenantByEmailDomain).mockResolvedValue(null)
      vi.mocked(repo.findTenantBySlug).mockResolvedValue(null)

      const ctx = makeCtx()

      await expect(
        login(ctx, { email: 'user@unknown-domain.nl', password: 'Welkom01!Welkom01!' }),
      ).rejects.toMatchObject({ statusCode: 401, authCode: 'invalid_credentials' })
    })

    it('gooit 401 bij ongeldig wachtwoord', async () => {
      const { login } = await import('../../../../services/auth/service.js')
      const repo = await import('../../../../services/auth/repository.js')

      vi.mocked(repo.findTenantByEmailDomain).mockResolvedValue({ id: 't1', slug: 'acme' })
      vi.mocked(repo.findUserByEmail).mockResolvedValue({
        id: 'u1',
        tenantId: 't1',
        email: 'user@acme.nl',
        passwordHash: '$2b$12$invalid.hash.that.wont.match.any.password.XXXXXXXX',
        role: 'employee',
        employeeId: null,
      })

      const ctx = makeCtx()

      await expect(
        login(ctx, { email: 'user@acme.nl', password: 'WrongPassword123!' }),
      ).rejects.toMatchObject({ statusCode: 401, authCode: 'invalid_credentials' })
    })

    it('blokkeert als rate-limit al overschreden is', async () => {
      const { login } = await import('../../../../services/auth/service.js')
      const rateLimit = await import('../../../../utils/rate-limit.js')

      vi.mocked(rateLimit.isRateLimited).mockResolvedValue({ blocked: true, retryAfterSeconds: 120 })

      const ctx = makeCtx()

      await expect(
        login(ctx, { email: 'user@acme.nl', password: 'Welkom01!Welkom01!' }),
      ).rejects.toMatchObject({ statusCode: 429, authCode: 'rate_limited' })
    })
  })
})
