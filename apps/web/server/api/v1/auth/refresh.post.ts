/**
 * POST /api/v1/auth/refresh
 *
 * Publiek pad — JWT niet vereist (de cookie is het credential).
 * CSRF double-submit check: `hr_csrf` cookie === `X-CSRF-Token` header.
 *
 * Flow:
 * 1. Lees refresh-token uit httpOnly `hr_refresh` cookie.
 * 2. CSRF-check: cookie-waarde === request-header.
 * 3. Zoek tenantId op via refresh-token hash (zonder RLS).
 * 4. Delegeer aan auth-service (token-validatie + rotatie).
 * 5. Roteer cookies + return nieuw access-token.
 */

import { defineEventHandler, getCookie, getHeader, createError } from 'h3'
import { buildAuthContext } from '../../../utils/auth.js'
import { setAuthCookies, REFRESH_COOKIE, CSRF_COOKIE } from '../../../utils/cookies.js'
import { generateRefreshToken } from '../../../utils/auth-token.js'
import { findTenantIdForRefreshToken } from '../../../services/auth/repository.js'
import * as service from '../../../services/auth/service.js'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, REFRESH_COOKIE)

  if (!refreshToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Refresh-token ontbreekt',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Refresh-token ontbreekt',
        status: 401,
        error: 'refresh_missing',
      },
    })
  }

  // CSRF double-submit check (ADR-0006 §2)
  const csrfCookie = getCookie(event, CSRF_COOKIE)
  const csrfHeader = getHeader(event, 'x-csrf-token')

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: 'CSRF-verificatie mislukt',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'CSRF-verificatie mislukt',
        status: 401,
        error: 'csrf_mismatch',
      },
    })
  }

  // Zoek tenantId op zonder RLS (we kennen de tenant nog niet)
  const tenantId = await findTenantIdForRefreshToken(refreshToken)

  if (!tenantId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Refresh-token is ongeldig of verlopen',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Refresh-token is ongeldig of verlopen',
        status: 401,
        error: 'refresh_revoked',
      },
    })
  }

  const ctx = buildAuthContext(event)
  const tokens = await service.refresh({ refreshToken, tenantId, ctx })

  // Roteer: nieuwe refresh-cookie + nieuwe CSRF-cookie
  const newCsrfToken = generateRefreshToken()
  setAuthCookies(event, tokens.refreshToken, newCsrfToken)

  return {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    token_type: 'Bearer' as const,
  }
})
