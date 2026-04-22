/**
 * auth-context Fastify-plugin (AUTH-0004)
 *
 * Parst Authorization: Bearer <jwt>, valideert HS256, decodeert claims.
 * Zet request.user = { id, tenantId, role } op elke authenticated request.
 *
 * Publieke routes: config.public = true — geen JWT vereist.
 * Skip-lijst hardcoded: /healthz, /v1/auth/login, /v1/auth/refresh, /v1/auth/logout.
 *
 * Op success: SET LOCAL app.tenant_id wordt gezet door de repository-laag
 * (withTenant). Dit plugin zet alleen request.user.
 *
 * Performance-budget: < 5ms p95. jwt.verify is sync (HS256 = HMAC-sha256).
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { type TokenExpiredError, type JsonWebTokenError } from 'jsonwebtoken'
import { verifyAccessToken } from '../modules/auth/token.js'
import type { JwtClaims } from '@hr-saas/contracts/auth'

// Routes die nooit een JWT vereisen — ook zonder config.public.
const PUBLIC_PATHS = new Set([
  '/healthz',
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
])

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string
      tenantId: string
      role: JwtClaims['role']
    } | null
  }
  interface FastifyContextConfig {
    public?: boolean
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  // Decoreer request.user met null als default
  app.decorateRequest('user', null)

  app.addHook('onRequest', async (req, reply) => {
    const isPublicPath = PUBLIC_PATHS.has(req.url.split('?')[0] ?? '')
    const isPublicConfig = req.routeOptions?.config?.public === true

    if (isPublicPath || isPublicConfig) return

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        type: 'https://hr-saas.example/problems/auth',
        title: 'Niet geauthenticeerd',
        status: 401,
        detail: 'Authorization Bearer-token ontbreekt',
        error: 'unauthorized',
      })
    }

    const token = authHeader.slice(7)

    try {
      const claims = verifyAccessToken(token)
      req.user = {
        id: claims.sub,
        tenantId: claims.tenantId,
        role: claims.role,
      }
      // Verrijk de log-context (zonder PII — alleen IDs)
      req.log = req.log.child({ userId: claims.sub, tenantId: claims.tenantId })
    } catch (err) {
      const isExpired = (err as TokenExpiredError).name === 'TokenExpiredError'
      const isJwtError = (err as JsonWebTokenError).name === 'JsonWebTokenError'

      if (isExpired) {
        return reply.code(401).send({
          type: 'https://hr-saas.example/problems/auth',
          title: 'Token verlopen',
          status: 401,
          detail: 'Vernieuw je sessie via /v1/auth/refresh',
          error: 'token_expired',
        })
      }

      if (isJwtError) {
        return reply.code(401).send({
          type: 'https://hr-saas.example/problems/auth',
          title: 'Ongeldig token',
          status: 401,
          detail: 'JWT is niet geldig',
          error: 'unauthorized',
        })
      }

      // Onverwachte fout — log en stuur 401
      req.log.error({ err }, 'auth-context: onverwachte JWT-fout')
      return reply.code(401).send({
        type: 'https://hr-saas.example/problems/auth',
        title: 'Authenticatiefout',
        status: 401,
        error: 'unauthorized',
      })
    }
  })
}

export const authContextPlugin = fp(plugin, { name: 'auth-context' })
