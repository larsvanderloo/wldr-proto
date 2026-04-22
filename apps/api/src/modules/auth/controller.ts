/**
 * Auth controller — Fastify route-definities voor /v1/auth/*.
 *
 * Alle routes zijn public (config.public = true) behalve /register
 * die een geldig JWT vereist (hr_admin-rol).
 *
 * Cookies:
 *   hr_refresh — httpOnly, Secure (prod), SameSite=Lax, Path=/v1/auth, 7 dagen
 *   hr_csrf    — zelfde scope, GEEN httpOnly (frontend leest hem voor CSRF-header)
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  registerRequestSchema,
  registerResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  refreshResponseSchema,
} from '@hr-saas/contracts/auth'
import * as service from './service.js'
import { generateRefreshToken } from './token.js'

const REFRESH_COOKIE = 'hr_refresh'
const CSRF_COOKIE = 'hr_csrf'
const COOKIE_PATH = '/v1/auth'
const REFRESH_TTL = 7 * 24 * 60 * 60 // 7 dagen in seconden

function cookieDomain(): string | undefined {
  return process.env.NODE_ENV === 'production' ? '.larsvdloo.com' : undefined
}

function setAuthCookies(reply: FastifyReply, refreshToken: string, csrfToken: string): void {
  const domain = cookieDomain()
  const isProduction = process.env.NODE_ENV === 'production'

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL,
    ...(domain ? { domain } : {}),
  })

  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL,
    ...(domain ? { domain } : {}),
  })
}

function clearAuthCookies(reply: FastifyReply): void {
  const domain = cookieDomain()
  const opts = {
    path: COOKIE_PATH,
    maxAge: 0,
    ...(domain ? { domain } : {}),
  }
  reply.clearCookie(REFRESH_COOKIE, opts)
  reply.clearCookie(CSRF_COOKIE, opts)
}

export const authModule: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/auth/register
   * Vereist: ingelogde hr_admin (auth-context plugin zet request.user).
   */
  app.post('/auth/register', {
    schema: {
      body: registerRequestSchema,
      response: { 201: registerResponseSchema },
    },
    handler: async (req, reply) => {
      const result = await service.register(req, req.body as never)
      reply.code(201)
      return result
    },
  })

  /**
   * POST /v1/auth/login
   * Publieke route — geen auth-context vereist.
   */
  app.post('/auth/login', {
    config: { public: true },
    schema: {
      body: loginRequestSchema,
      response: { 200: loginResponseSchema },
    },
    handler: async (req, reply) => {
      const tokens = await service.login(req, req.body as never)
      const csrfToken = generateRefreshToken() // random 32 bytes hex als CSRF-token

      setAuthCookies(reply, tokens.refreshToken, csrfToken)

      return {
        access_token: tokens.accessToken,
        expires_in: tokens.expiresIn,
        token_type: 'Bearer' as const,
      }
    },
  })

  /**
   * POST /v1/auth/refresh
   * Publieke route — refresh-token komt via httpOnly-cookie.
   * CSRF double-submit: cookies.hr_csrf === headers['x-csrf-token'].
   */
  app.post('/auth/refresh', {
    config: { public: true },
    schema: {
      response: { 200: refreshResponseSchema },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      // CSRF double-submit check
      const cookieCsrf = req.cookies[CSRF_COOKIE]
      const headerCsrf = req.headers['x-csrf-token']

      if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
        return reply.code(401).send({
          type: 'https://hr-saas.example/problems/auth',
          title: 'CSRF-fout',
          status: 401,
          detail: 'CSRF-token ontbreekt of komt niet overeen',
          error: 'csrf_mismatch',
        })
      }

      const refreshToken = req.cookies[REFRESH_COOKIE]
      if (!refreshToken) {
        return reply.code(401).send({
          type: 'https://hr-saas.example/problems/auth',
          title: 'Niet geauthenticeerd',
          status: 401,
          detail: 'Refresh-token cookie ontbreekt',
          error: 'refresh_revoked',
        })
      }

      // Haal tenantId op via token-hash lookup (cross-tenant, zie findTenantIdForRefreshToken)
      const tenantId = await findTenantIdForRefreshToken(refreshToken)
      if (!tenantId) {
        return reply.code(401).send({
          type: 'https://hr-saas.example/problems/auth',
          title: 'Niet geauthenticeerd',
          status: 401,
          detail: 'Refresh-token is verlopen of ingetrokken',
          error: 'refresh_revoked',
        })
      }

      const tokens = await service.refresh({ refreshToken, tenantId, req })
      const newCsrfToken = generateRefreshToken()

      setAuthCookies(reply, tokens.refreshToken, newCsrfToken)

      return reply.send({
        access_token: tokens.accessToken,
        expires_in: tokens.expiresIn,
        token_type: 'Bearer' as const,
      })
    },
  })

  /**
   * POST /v1/auth/logout
   * Publieke route (qua auth) — revoke refresh-token + clear cookies.
   */
  app.post('/auth/logout', {
    config: { public: true },
    schema: {
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      const refreshToken = req.cookies[REFRESH_COOKIE]
      if (refreshToken) {
        // Best-effort: als de token al verlopen is, gewoon doorgaan
        const tenantId = await findTenantIdForRefreshToken(refreshToken)
        if (tenantId) {
          await service.logout(tenantId, refreshToken).catch(() => void 0)
        }
      }
      clearAuthCookies(reply)
      reply.code(204).send(null)
    },
  })
}

/**
 * Cross-tenant lookup van tenantId via refresh-token hash.
 * Noodzakelijk voor refresh + logout: de JWT is mogelijk verlopen/absent.
 *
 * Dit is de ENIGE plek in de codebase waar we zonder tenant-scope een
 * token_hash opzoeken. De hash zelf (sha256) is de authenticatie; de
 * tenantId die we teruggeven wordt dan direct als RLS-scope gebruikt.
 *
 * withoutRls() is hier expliciet toegestaan — zie @hr-saas/db documentatie.
 * We selecteren UITSLUITEND tenant_id (geen PII, geen user-data).
 */
async function findTenantIdForRefreshToken(plaintextToken: string): Promise<string | null> {
  const { withoutRls } = await import('@hr-saas/db')
  const { hashRefreshToken } = await import('./token.js')

  const tokenHash = hashRefreshToken(plaintextToken)

  return withoutRls(async (prisma) => {
    const result = await prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
        AND revoked_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `
    return result[0]?.tenant_id ?? null
  })
}
