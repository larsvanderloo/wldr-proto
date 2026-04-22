/**
 * Auth repository — enige laag die Prisma aanraakt voor users + refresh_tokens.
 *
 * Conventies:
 * - withTenant() voor alle operaties die RLS nodig hebben.
 * - Tenant-lookup (voor login) draait ZONDER RLS (tenants-tabel heeft geen RLS).
 *   Dit is een bewuste uitzondering: we weten de tenant nog niet voor we inloggen.
 * - Nooit password_hash of token_hash teruggeven buiten deze laag.
 */

import { getPrisma, withTenant, type Prisma } from '@hr-saas/db'
import { hashRefreshToken, refreshTokenExpiresAt } from './token.js'

type UserRole = Prisma.UserCreateInput['role']

export interface AuthUser {
  id: string
  tenantId: string
  email: string
  passwordHash: string
  role: UserRole
  employeeId: string | null
}

export interface PublicUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Zoek een tenant op via email-domein (login-flow primaire pad).
 * Geen RLS nodig: tenants-tabel is niet tenant-scoped.
 */
export async function findTenantByEmailDomain(
  emailDomain: string,
): Promise<{ id: string; slug: string } | null> {
  const prisma = getPrisma()
  return prisma.tenant.findUnique({
    where: { emailDomain },
    select: { id: true, slug: true },
  })
}

/**
 * Zoek een tenant op via slug (login-flow fallback-pad).
 */
export async function findTenantBySlug(
  slug: string,
): Promise<{ id: string; slug: string } | null> {
  const prisma = getPrisma()
  return prisma.tenant.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, slug: true },
  })
}

/**
 * Zoek een actieve user op (email, tenantId). Geeft password_hash terug (intern gebruik).
 * Alleen te gebruiken vlak voor bcrypt.compare — niet buiten service-laag.
 */
export async function findUserByEmail(tenantId: string, email: string): Promise<AuthUser | null> {
  return withTenant(tenantId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: {
        id: true,
        tenantId: true,
        email: true,
        passwordHash: true,
        role: true,
        employeeId: true,
        deletedAt: true,
      },
    })
    if (!user || user.deletedAt !== null) return null
    return user
  })
}

/**
 * Maak een nieuwe user aan in dezelfde transactie.
 * Audit-trigger op de DB schrijft automatisch de audit_event.
 */
export async function createUser(
  tenantId: string,
  actorUserId: string | null,
  data: {
    email: string
    passwordHash: string
    role: UserRole
    employeeId: string | null
  },
): Promise<PublicUser> {
  return withTenant(tenantId, async (tx) => {
    // Zet actor voor de audit-trigger (als er een actieve admin is).
    if (actorUserId) {
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${actorUserId}'`)
    }
    const user = await tx.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        employeeId: data.employeeId ?? undefined,
      },
      select: { id: true, email: true, role: true },
    })
    return user
  })
}

/**
 * Controleer of een email al bestaat binnen de tenant (voor 409-detectie).
 */
export async function userEmailExists(tenantId: string, email: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const count = await tx.user.count({
      where: { tenantId, email, deletedAt: null },
    })
    return count > 0
  })
}

/**
 * Sla een nieuw refresh-token op (als SHA-256-hash). Geeft de token-id terug.
 */
export async function storeRefreshToken(
  tenantId: string,
  userId: string,
  plaintextToken: string,
): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    const token = await tx.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashRefreshToken(plaintextToken),
        expiresAt: refreshTokenExpiresAt(),
      },
      select: { id: true },
    })
    return token.id
  })
}

/**
 * Zoek een geldig (niet-verlopen, niet-gerevoked) refresh-token op hash.
 * Geeft de user + tenantId terug voor JWT-heruitgifte.
 */
export async function findValidRefreshToken(
  tenantId: string,
  plaintextToken: string,
): Promise<{
  tokenId: string
  userId: string
  tenantId: string
  userRole: UserRole
  employeeId: string | null
} | null> {
  const tokenHash = hashRefreshToken(plaintextToken)
  return withTenant(tenantId, async (tx) => {
    const token = await tx.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        user: {
          select: { role: true, employeeId: true, deletedAt: true },
        },
      },
    })
    if (!token || token.user.deletedAt !== null) return null
    return {
      tokenId: token.id,
      userId: token.userId,
      tenantId: token.tenantId,
      userRole: token.user.role,
      employeeId: token.user.employeeId,
    }
  })
}

/**
 * Roteer een refresh-token: revoke oude, INSERT nieuwe, in één transactie.
 * Geeft het nieuwe plaintext-token terug.
 */
export async function rotateRefreshToken(
  tenantId: string,
  oldTokenId: string,
  userId: string,
): Promise<string> {
  const { generateRefreshToken } = await import('./token.js')
  const newToken = generateRefreshToken()
  const newTokenHash = hashRefreshToken(newToken)

  await withTenant(tenantId, async (tx) => {
    // Revoke de oude
    await tx.refreshToken.update({
      where: { id: oldTokenId },
      data: { revokedAt: new Date() },
    })
    // Sla de nieuwe op
    await tx.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: newTokenHash,
        expiresAt: refreshTokenExpiresAt(),
      },
    })
  })

  return newToken
}

/**
 * Revoke een refresh-token op basis van de hash (voor logout).
 */
export async function revokeRefreshToken(tenantId: string, plaintextToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(plaintextToken)
  await withTenant(tenantId, async (tx) => {
    await tx.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  })
}

/**
 * Verifieer of een employee_id bestaat en tot de tenant behoort.
 * Gebruikt bij register-validatie.
 */
export async function employeeExistsInTenant(
  tenantId: string,
  employeeId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const count = await tx.employee.count({
      where: { id: employeeId, tenantId, deletedAt: null },
    })
    return count > 0
  })
}
