/**
 * Auth-context middleware — JWT-validatie en `event.context.user` vullen.
 *
 * Draait na request-id en request-log middleware.
 * Publieke paden worden overgeslagen (geen JWT vereist).
 *
 * Sequencing:
 * 1. Skip als het pad publiek is.
 * 2. Lees `Authorization: Bearer <token>` header.
 * 3. Verifieer JWT → zet `event.context.user = { id, tenantId, role }`.
 * 4. Verrijk de child-logger met userId + tenantId.
 * 5. Bij TokenExpiredError → 401 `token_expired`.
 * 6. Bij JsonWebTokenError of missing header → 401 `unauthorized`.
 *
 * Tenant-context is direct beschikbaar via `event.context.user.tenantId`.
 * Geen aparte tenant-context middleware nodig (ADR-0007 V3).
 */

import { defineEventHandler, getHeader, createError } from 'h3'
import jwt from 'jsonwebtoken'
import { verifyAccessToken } from '../utils/auth-token.js'

// Paden die GEEN geldig JWT vereisen
const PUBLIC_PATHS = new Set([
  '/api/v1/healthz',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
])

export default defineEventHandler((event) => {
  // Alleen /api/* bewaken
  if (!event.path.startsWith('/api/')) return

  // Publieke routes overslaan
  if (PUBLIC_PATHS.has(event.path)) return

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Niet geauthenticeerd',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Niet geauthenticeerd',
        status: 401,
        error: 'unauthorized',
      },
    })
  }

  const token = authHeader.slice(7) // verwijder 'Bearer '

  try {
    const claims = verifyAccessToken(token)
    event.context.user = {
      id: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role,
    }

    // Verrijk de logger met auth-context (PII-veilig: alleen IDs, geen email)
    event.context.log = event.context.log.child({
      userId: claims.sub,
      tenantId: claims.tenantId,
    })
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Token verlopen',
        data: {
          type: 'https://hr-saas.example/problems/error',
          title: 'Token verlopen',
          status: 401,
          error: 'token_expired',
        },
      })
    }

    throw createError({
      statusCode: 401,
      statusMessage: 'Ongeldige authenticatie',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Ongeldige authenticatie',
        status: 401,
        error: 'unauthorized',
      },
    })
  }
})
