/**
 * POST /api/v1/auth/logout
 *
 * Publiek pad (cookie is het credential — geen JWT vereist).
 * Best-effort revoke: als de cookie er niet is of al verlopen, toch 204.
 *
 * Flow:
 * 1. Lees refresh-token uit httpOnly cookie.
 * 2. Als aanwezig: zoek tenantId op en revoke in DB.
 * 3. Clear beide cookies.
 * 4. Return 204 No Content.
 */

import { defineEventHandler, getCookie, setResponseStatus } from 'h3'
import { clearAuthCookies, REFRESH_COOKIE } from '../../../utils/cookies.js'
import { findTenantIdForRefreshToken } from '../../../services/auth/repository.js'
import * as service from '../../../services/auth/service.js'

export default defineEventHandler(async (event) => {
  const refreshToken = getCookie(event, REFRESH_COOKIE)

  if (refreshToken) {
    // Best-effort: zoek de tenant op en revoke de token.
    // Als het token al verlopen of gerevoked is, gooit findTenantIdForRefreshToken null terug.
    const tenantId = await findTenantIdForRefreshToken(refreshToken)
    if (tenantId) {
      await service.logout(tenantId, refreshToken)
    }
  }

  clearAuthCookies(event)
  setResponseStatus(event, 204)
  return null
})
