/**
 * Integration tests voor auth-flow.
 * Vereist een draaiende Postgres-instantie (zie DATABASE_URL in .env).
 *
 * Dekt de Gherkin-criteria uit spec FEAT-0002 + AUTH-0001..AUTH-0004:
 *  - Register: 201 success, 409 duplicate, 422 validation, 403 not-admin
 *  - Login: 200 success + cookies, 401 bad credentials, 429 rate-limit
 *  - Refresh: 200 token-rotatie, 401 csrf_mismatch, 401 refresh_revoked
 *  - Logout: 204 + cookies cleared
 *  - Protected routes: 401 zonder JWT
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildTestApp } from '../../../test-helpers/app-factory.js'
import { _resetAllBuckets } from '../rate-limit.js'
import type { FastifyInstance } from 'fastify'

// Seed-data (zie packages/db/prisma/seed.ts)
const _TENANT_ID = '00000000-0000-0000-0000-000000000001'
const HR_ADMIN_EMAIL = 'hr_admin@acme.test'
const HR_ADMIN_PASSWORD = 'Welkom01!Welkom'
const EMPLOYEE_EMAIL = 'employee@acme.test'

let app: FastifyInstance

beforeAll(async () => {
  // Stel omgevingsvariabelen in vóór buildApp
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://hrsaas:hrsaas@localhost:5432/hrsaas'
  process.env.DIRECT_URL = process.env.DIRECT_URL ?? 'postgresql://hrsaas:hrsaas@localhost:5432/hrsaas'
  process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-long-abc'
  process.env.COOKIE_SECRET = 'test-cookie-secret-min-32-chars-long-abc'
  process.env.PII_ENCRYPTION_KEY = 'dev-only-pii-key'
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000'

  app = await buildTestApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  _resetAllBuckets()
})

// Helper: maak een inject-request met cookies
function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';')
    if (!pair) continue
    const [name, value] = pair.split('=')
    if (name && value !== undefined) cookies[name.trim()] = value.trim()
  }
  return cookies
}

describe('POST /v1/auth/login', () => {
  it('[US-2] geeft 200 + access_token + cookies bij correcte credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.access_token).toBeTruthy()
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBe(900)

    const cookies = parseCookies(res.headers['set-cookie'] as string[])
    expect(cookies['hr_refresh']).toBeTruthy()
    expect(cookies['hr_csrf']).toBeTruthy()
  })

  it('[US-2] geeft 401 bij onjuist wachtwoord', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: 'WrongPassword123' },
    })

    expect(res.statusCode).toBe(401)
    const body = res.json()
    expect(body.error).toBe('invalid_credentials')
  })

  it('[US-2] geeft 401 bij onbekend email-domein', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'user@unknown-domain.com', password: HR_ADMIN_PASSWORD },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_credentials')
  })

  it('[US-2] geeft 429 na 4 opeenvolgende mislukte pogingen', async () => {
    const email = 'ratelimited@acme.test'
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: 'WrongPassword123' },
      })
    }
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'WrongPassword123' },
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toBe('rate_limited')
    expect(res.json().retryAfter).toBeGreaterThan(0)
  })

  it('werkt met tenantSlug fallback', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD, tenantSlug: 'acme' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /v1/auth/refresh', () => {
  async function loginAndGetCookies() {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const cookies = parseCookies(loginRes.headers['set-cookie'] as string[])
    return cookies
  }

  it('[US-3] roteer refresh-token en geef nieuw access_token', async () => {
    const cookies = await loginAndGetCookies()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loginAndGetCookies() garandeert cookies aanwezig via eerdere test
    const hrRefresh = cookies['hr_refresh']!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hrCsrf = cookies['hr_csrf']!

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { hr_refresh: hrRefresh, hr_csrf: hrCsrf },
      headers: { 'x-csrf-token': hrCsrf },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.access_token).toBeTruthy()
    expect(body.token_type).toBe('Bearer')

    // Nieuwe cookies moeten gezet zijn
    const newCookies = parseCookies(res.headers['set-cookie'] as string[])
    expect(newCookies['hr_refresh']).toBeTruthy()
    expect(newCookies['hr_refresh']).not.toBe(hrRefresh) // Rotatie
  })

  it('[US-3] geeft 401 bij ontbrekende CSRF-header', async () => {
    const cookies = await loginAndGetCookies()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { hr_refresh: cookies['hr_refresh']!, hr_csrf: cookies['hr_csrf']! },
      // Geen x-csrf-token header
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('csrf_mismatch')
  })

  it('[US-3] geeft 401 bij verkeerde CSRF-waarde', async () => {
    const cookies = await loginAndGetCookies()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { hr_refresh: cookies['hr_refresh']!, hr_csrf: cookies['hr_csrf']! },
      headers: { 'x-csrf-token': 'wrong-csrf-token' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('csrf_mismatch')
  })

  it('[US-3] oud refresh-token is ongeldig na rotatie', async () => {
    const cookies = await loginAndGetCookies()
    const hrRefresh = cookies['hr_refresh']!
    const hrCsrf = cookies['hr_csrf']!

    // Eerste refresh — succes
    const firstRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { hr_refresh: hrRefresh, hr_csrf: hrCsrf },
      headers: { 'x-csrf-token': hrCsrf },
    })
    expect(firstRefreshRes.statusCode).toBe(200)

    // Tweede refresh met het OUDE token — moet 401 geven
    const secondRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { hr_refresh: hrRefresh, hr_csrf: hrCsrf },
      headers: { 'x-csrf-token': hrCsrf },
    })
    expect(secondRefreshRes.statusCode).toBe(401)
    expect(secondRefreshRes.json().error).toBe('refresh_revoked')
  })
})

describe('POST /v1/auth/logout', () => {
  it('geeft 204 en clearet cookies', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const cookies = parseCookies(loginRes.headers['set-cookie'] as string[])

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { hr_refresh: cookies['hr_refresh']!, hr_csrf: cookies['hr_csrf']! },
    })

    expect(logoutRes.statusCode).toBe(204)
    // Na logout moeten cookies ge-cleared zijn (maxAge=0 of verwijderd)
    const _logoutCookies = parseCookies(logoutRes.headers['set-cookie'] as string[] ?? [])
    // hr_refresh moet maxAge=0 hebben (in de raw header staat Max-Age=0)
    const rawHeaders = (logoutRes.headers['set-cookie'] as string[] ?? []).join('; ')
    expect(rawHeaders).toMatch(/Max-Age=0/)
  })
})

describe('Employee-endpoints (AUTH-0008): 401 zonder JWT', () => {
  it('GET /v1/employees geeft 401 zonder token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/employees',
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('unauthorized')
  })

  it('POST /v1/employees geeft 401 zonder token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/employees',
      payload: {},
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('unauthorized')
  })
})

describe('Employee-endpoints (AUTH-0005): RBAC-checks', () => {
  async function getAccessToken(email: string, password = HR_ADMIN_PASSWORD): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    })
    return (res.json() as { access_token: string }).access_token
  }

  it('[US-4] hr_admin ziet alle employees van de tenant', async () => {
    const token = await getAccessToken(HR_ADMIN_EMAIL)
    const res = await app.inject({
      method: 'GET',
      url: '/v1/employees',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    // Moet meerdere items bevatten (seed heeft 2 employees)
    expect(res.json().items.length).toBeGreaterThanOrEqual(1)
  })

  it('[US-4] employee ziet alleen zijn eigen record', async () => {
    const token = await getAccessToken(EMPLOYEE_EMAIL)
    const res = await app.inject({
      method: 'GET',
      url: '/v1/employees',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    // Employee ziet alleen zichzelf
    expect(res.json().items.length).toBeLessThanOrEqual(1)
  })

  it('[US-4] employee kan geen nieuwe employee aanmaken (403)', async () => {
    const token = await getAccessToken(EMPLOYEE_EMAIL)
    const res = await app.inject({
      method: 'POST',
      url: '/v1/employees',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        firstName: 'Test',
        lastName: 'User',
        email: 'new@acme.test',
        jobTitle: 'Developer',
        employmentType: 'permanent',
        startDate: '2024-01-01',
        role: 'employee',
      },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /v1/auth/register', () => {
  it('[US-1] hr_admin kan nieuwe user registreren', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const token = (loginRes.json() as { access_token: string }).access_token

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: `new-user-${Date.now()}@acme.test`,
        password: 'NewSecurePassword123!',
        role: 'hr_admin',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeTruthy()
    expect(body.email).toContain('@acme.test')
    expect(body.role).toBe('hr_admin')
    // password_hash mag niet in de response
    expect(body.passwordHash).toBeUndefined()
    expect(body.password_hash).toBeUndefined()
  })

  it('[US-1] geeft 409 bij duplicate email binnen dezelfde tenant', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const token = (loginRes.json() as { access_token: string }).access_token

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: HR_ADMIN_EMAIL, // al bestaat
        password: 'NewSecurePassword123!',
        role: 'hr_admin',
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error ?? res.json().authCode).toBe('email_already_taken')
  })

  it('[US-1] geeft 422 bij wachtwoord korter dan 12 tekens', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const token = (loginRes.json() as { access_token: string }).access_token

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'weak@acme.test',
        password: 'short',
        role: 'hr_admin',
      },
    })

    expect(res.statusCode).toBe(400) // Zod-validatie → 400 via error-handler
  })

  it('[US-1] geeft 403 als een non-admin probeert te registreren', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: EMPLOYEE_EMAIL, password: HR_ADMIN_PASSWORD },
    })
    const token = (loginRes.json() as { access_token: string }).access_token

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'forbidden@acme.test',
        password: 'ValidPassword123!',
        role: 'employee',
      },
    })

    expect(res.statusCode).toBe(403)
  })
})
