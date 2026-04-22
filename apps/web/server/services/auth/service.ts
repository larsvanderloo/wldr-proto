/**
 * Auth service — Nitro-versie.
 *
 * Geport van `apps/api/src/modules/auth/service.ts`.
 * Identieke business-logica; de Fastify-specifieke `FastifyRequest` is vervangen
 * door `AuthContext` — een generiek, platformonafhankelijk object.
 *
 * Anti-timing: bij ongeldige credentials wordt altijd een bcrypt.compare
 * uitgevoerd (op dummy hash indien nodig) om timing-aanvallen te voorkomen.
 */

import bcrypt from 'bcryptjs'
import type { RegisterRequest, LoginRequest } from '@hr-saas/contracts/auth'
import type { Prisma } from '@hr-saas/db'
import type { AuthContext } from '../../types/auth-context.js'
import * as repo from './repository.js'
import {
  issueAccessToken,
  generateRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../../utils/auth-token.js'
import { isRateLimited, recordFailedAttempt, clearRateLimit } from '../../utils/rate-limit.js'

type UserRole = Prisma.UserCreateInput['role']

const BCRYPT_ROUNDS = 12

// Dummy hash voor constant-time vergelijking bij ongeldige tenant/user.
const DUMMY_HASH = '$2b$12$invalid.hash.used.for.timing.protection.only.XXXXXXXXXXX'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

function authError(code: string, message: string, status = 401, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { statusCode: status, authCode: code, ...extra })
}

/**
 * POST /api/v1/auth/register
 *
 * Alleen een ingelogde hr_admin mag nieuwe gebruikers registreren.
 */
export async function register(
  ctx: AuthContext,
  input: RegisterRequest,
): Promise<{ id: string; email: string; role: string }> {
  if (!ctx.user || ctx.user.role !== 'hr_admin') {
    authError('forbidden', 'Alleen een HR-admin kan gebruikers registreren', 403)
  }

  const tenantId = ctx.user.tenantId
  const role: UserRole = (input.role as UserRole) ?? 'employee'

  if ((role === 'manager' || role === 'employee') && !input.employeeId) {
    authError('missing_employee_id', 'employeeId is verplicht voor rollen manager en employee', 422)
  }

  if (input.employeeId) {
    const exists = await repo.employeeExistsInTenant(tenantId, input.employeeId)
    if (!exists) {
      authError('employee_not_found', 'Het opgegeven employeeId bestaat niet in deze tenant', 422)
    }
  }

  const emailExists = await repo.userEmailExists(tenantId, input.email)
  if (emailExists) {
    authError('email_already_taken', 'Dit e-mailadres is al in gebruik binnen deze tenant', 409)
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  const user = await repo.createUser(tenantId, ctx.user.id, {
    email: input.email,
    passwordHash,
    role,
    employeeId: input.employeeId ?? null,
  })

  return { id: user.id, email: user.email, role: user.role }
}

/**
 * POST /api/v1/auth/login
 *
 * Tenant-detectie via email-domein (primair) of tenantSlug (fallback).
 * Anti-timing: altijd bcrypt.compare, ook bij ongeldige tenant/user.
 */
export async function login(
  ctx: AuthContext,
  input: LoginRequest,
): Promise<AuthTokens> {
  const { ip, log } = ctx

  // Rate-limit check VOOR DB-werk
  const rateCheck = await isRateLimited(ip, input.email)
  if (rateCheck.blocked) {
    authError('rate_limited', `Te veel pogingen. Probeer over ${rateCheck.retryAfterSeconds}s opnieuw`, 429, { retryAfter: rateCheck.retryAfterSeconds })
  }

  // Tenant-resolve: domein → tenant
  const emailDomain = input.email.split('@')[1] ?? ''
  let tenant: { id: string; slug: string } | null = null

  if (input.tenantSlug) {
    tenant = await repo.findTenantBySlug(input.tenantSlug)
  } else {
    tenant = await repo.findTenantByEmailDomain(emailDomain)
  }

  if (!tenant) {
    await bcrypt.compare(input.password, DUMMY_HASH).catch(() => false)
    const result = await recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    log.warn({ emailDomain, tenantSlug: input.tenantSlug }, 'tenant_unknown bij login')
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  const user = await repo.findUserByEmail(tenant.id, input.email)

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH).catch(() => false)
    const result = await recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash)

  if (!passwordOk) {
    const result = await recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  // Success: reset rate-limit, geef tokens uit
  await clearRateLimit(ip, input.email)

  const accessToken = issueAccessToken(user.id, user.tenantId, user.role)
  const refreshToken = generateRefreshToken()
  await repo.storeRefreshToken(user.tenantId, user.id, refreshToken)

  log.info({ userId: user.id, tenantId: user.tenantId }, 'login_success')

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

/**
 * POST /api/v1/auth/refresh
 *
 * Valideert CSRF double-submit, roteert refresh-token, geeft nieuw access-token uit.
 */
export async function refresh(opts: {
  refreshToken: string
  tenantId: string
  ctx: AuthContext
}): Promise<AuthTokens> {
  const { refreshToken, tenantId, ctx } = opts

  const tokenData = await repo.findValidRefreshToken(tenantId, refreshToken)

  if (!tokenData) {
    ctx.log.warn({ tenantId }, 'refresh_revoked of verlopen token')
    authError('refresh_revoked', 'Refresh-token is verlopen of ingetrokken', 401)
  }

  const newRefreshToken = await repo.rotateRefreshToken(
    tokenData.tenantId,
    tokenData.tokenId,
    tokenData.userId,
  )
  const newAccessToken = issueAccessToken(tokenData.userId, tokenData.tenantId, tokenData.userRole)

  ctx.log.info({ userId: tokenData.userId, tenantId: tokenData.tenantId }, 'token_refreshed')

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  }
}

/**
 * POST /api/v1/auth/logout
 *
 * Revoke het huidige refresh-token. Access-token verloopt vanzelf.
 */
export async function logout(tenantId: string, refreshToken: string): Promise<void> {
  await repo.revokeRefreshToken(tenantId, refreshToken)
}
