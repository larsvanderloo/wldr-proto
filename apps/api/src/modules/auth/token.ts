/**
 * Token-helpers — JWT-uitgifte + refresh-token-generatie.
 * Alle crypto-operaties zitten hier; geen JWT-logica in controller of service.
 *
 * JWT: HS256, 15 min TTL, claims per jwtClaimsSchema (packages/contracts).
 * Refresh: crypto.randomBytes(32) hex — SHA-256-hash opgeslagen in DB.
 */

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { JwtClaims } from '@hr-saas/contracts/auth'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60 // 15 minuten
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 dagen

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET ontbreekt in environment')
  return secret
}

/**
 * Genereer een ondertekend JWT-access-token.
 */
export function issueAccessToken(
  userId: string,
  tenantId: string,
  role: JwtClaims['role'],
): string {
  const secret = getJwtSecret()
  return jwt.sign({ tenantId, role } satisfies Omit<JwtClaims, 'sub' | 'iat' | 'exp'>, secret, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  })
}

/**
 * Verifieer een JWT-access-token. Geeft claims terug of gooit een fout.
 * jwt.JsonWebTokenError = ongeldig, jwt.TokenExpiredError = verlopen.
 */
export function verifyAccessToken(token: string): JwtClaims {
  const secret = getJwtSecret()
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as Record<string, unknown>
  return {
    sub: payload['sub'] as string,
    tenantId: payload['tenantId'] as string,
    role: payload['role'] as JwtClaims['role'],
    iat: payload['iat'] as number,
    exp: payload['exp'] as number,
  }
}

/**
 * Genereer een opaque refresh-token (64 hex chars = 32 bytes).
 * Geeft plaintext terug — SHA-256-hash gaat naar de DB.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * SHA-256-hash van het plaintext refresh-token.
 * Dit is wat in `refresh_tokens.token_hash` opgeslagen wordt.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Expiry-timestamp voor de DB: nu + REFRESH_TOKEN_TTL_SECONDS.
 */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
}
