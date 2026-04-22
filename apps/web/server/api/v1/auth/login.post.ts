/**
 * POST /api/v1/auth/login
 *
 * Publiek pad — geen JWT vereist (overgeslagen door 02.auth-context.ts).
 * Rate-gelimiteerd via Postgres-backed token-bucket (Fase 1).
 *
 * Flow:
 * 1. Valideer body via Zod (loginRequestSchema).
 * 2. Delegeer aan auth-service (tenant-resolve + bcrypt + rate-limit).
 * 3. Zet httpOnly refresh-cookie + CSRF-cookie (ADR-0006 addendum).
 * 4. Return LoginResponse met access_token.
 */

import { defineEventHandler } from 'h3'
import { loginRequestSchema } from '@hr-saas/contracts/auth'
import { validateBody } from '../../../utils/validate.js'
import { buildAuthContext } from '../../../utils/auth.js'
import { setAuthCookies } from '../../../utils/cookies.js'
import { generateRefreshToken } from '../../../utils/auth-token.js'
import * as service from '../../../services/auth/service.js'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, loginRequestSchema)
  const ctx = buildAuthContext(event)

  const tokens = await service.login(ctx, body)

  // CSRF-token: aparte random waarde, niet gerelateerd aan de refresh-token
  const csrfToken = generateRefreshToken()

  setAuthCookies(event, tokens.refreshToken, csrfToken)

  return {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    token_type: 'Bearer' as const,
  }
})
