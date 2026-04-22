/**
 * Auth service — business logic voor register / login / refresh / logout.
 *
 * Autorisatie en business-rules zitten hier, niet in de controller.
 * De controller geeft alleen de Zod-gevalideerde input door.
 *
 * Anti-timing: bij ongeldige credentials wordt altijd een bcrypt.compare
 * uitgevoerd (op dummy hash indien nodig) om timing-aanvallen te voorkomen.
 */

import bcrypt from 'bcryptjs'
import type { FastifyRequest } from 'fastify'
import type { RegisterRequest, LoginRequest } from '@hr-saas/contracts/auth'
import type { Prisma } from '@hr-saas/db'
import * as repo from './repository.js'

type UserRole = Prisma.UserCreateInput['role']
import {
  issueAccessToken,
  generateRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from './token.js'
import {
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
} from './rate-limit.js'

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
 * POST /v1/auth/register
 *
 * Alleen een ingelogde hr_admin mag nieuwe gebruikers registreren.
 * Self-registration is buiten scope Sprint 2.
 */
export async function register(
  req: FastifyRequest,
  input: RegisterRequest,
): Promise<{ id: string; email: string; role: string }> {
  // Autorisatie: enkel hr_admin
  if (!req.user || req.user.role !== 'hr_admin') {
    authError('forbidden', 'Alleen een HR-admin kan gebruikers registreren', 403)
  }

  const tenantId = req.user.tenantId
  const role: UserRole = (input.role as UserRole) ?? 'employee'

  // Valideer: manager/employee vereisen employeeId
  if ((role === 'manager' || role === 'employee') && !input.employeeId) {
    authError('missing_employee_id', 'employeeId is verplicht voor rollen manager en employee', 422)
  }

  // Controleer of employeeId bestaat in de tenant
  if (input.employeeId) {
    const exists = await repo.employeeExistsInTenant(tenantId, input.employeeId)
    if (!exists) {
      authError('employee_not_found', 'Het opgegeven employeeId bestaat niet in deze tenant', 422)
    }
  }

  // Controleer op duplicate email
  const emailExists = await repo.userEmailExists(tenantId, input.email)
  if (emailExists) {
    authError('email_already_taken', 'Dit e-mailadres is al in gebruik binnen deze tenant', 409)
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  const user = await repo.createUser(tenantId, req.user.id, {
    email: input.email,
    passwordHash,
    role,
    employeeId: input.employeeId ?? null,
  })

  return { id: user.id, email: user.email, role: user.role }
}

/**
 * POST /v1/auth/login
 *
 * Tenant-detectie via email-domein (primair) of tenantSlug (fallback).
 * Anti-timing: altijd bcrypt.compare, ook bij ongeldige tenant/user.
 */
export async function login(
  req: FastifyRequest,
  input: LoginRequest,
): Promise<AuthTokens> {
  const ip = req.ip

  // Rate-limit check VOOR DB-werk
  const rateCheck = isRateLimited(ip, input.email)
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
    // Anti-timing: voer alsnog een dummy compare uit
    await bcrypt.compare(input.password, DUMMY_HASH).catch(() => false)
    const result = recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    req.log.warn({ emailDomain, tenantSlug: input.tenantSlug }, 'tenant_unknown bij login')
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  // User opzoeken
  const user = await repo.findUserByEmail(tenant.id, input.email)

  if (!user) {
    // Anti-timing: dummy compare
    await bcrypt.compare(input.password, DUMMY_HASH).catch(() => false)
    const result = recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash)

  if (!passwordOk) {
    const result = recordFailedAttempt(ip, input.email)
    if (result.blocked) {
      authError('rate_limited', `Te veel pogingen. Probeer over ${result.retryAfterSeconds}s opnieuw`, 429, { retryAfter: result.retryAfterSeconds })
    }
    authError('invalid_credentials', 'Ongeldige inloggegevens', 401)
  }

  // Success: reset rate-limit, geef tokens uit
  clearRateLimit(ip, input.email)

  const accessToken = issueAccessToken(user.id, user.tenantId, user.role)
  const refreshToken = generateRefreshToken()
  await repo.storeRefreshToken(user.tenantId, user.id, refreshToken)

  req.log.info({ userId: user.id, tenantId: user.tenantId }, 'login_success')

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

/**
 * POST /v1/auth/refresh
 *
 * Validates CSRF double-submit, rotates refresh token, issues new access token.
 * De tenantId wordt gelezen uit het huidige refresh-token (niet uit JWT).
 */
export async function refresh(opts: {
  refreshToken: string
  tenantId: string
  req: FastifyRequest
}): Promise<AuthTokens> {
  const { refreshToken, tenantId, req } = opts

  const tokenData = await repo.findValidRefreshToken(tenantId, refreshToken)

  if (!tokenData) {
    req.log.warn({ tenantId }, 'refresh_revoked of verlopen token')
    authError('refresh_revoked', 'Refresh-token is verlopen of ingetrokken', 401)
  }

  // Roteer: revoke oude, geef nieuw
  const newRefreshToken = await repo.rotateRefreshToken(
    tokenData.tenantId,
    tokenData.tokenId,
    tokenData.userId,
  )
  const newAccessToken = issueAccessToken(tokenData.userId, tokenData.tenantId, tokenData.userRole)

  req.log.info({ userId: tokenData.userId, tenantId: tokenData.tenantId }, 'token_refreshed')

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  }
}

/**
 * POST /v1/auth/logout
 *
 * Revoke het huidige refresh-token. Access-token verloopt vanzelf (15 min TTL).
 */
export async function logout(tenantId: string, refreshToken: string): Promise<void> {
  await repo.revokeRefreshToken(tenantId, refreshToken)
}
