/**
 * Unit-tests voor auth-token helpers.
 * Geen DB nodig — pure JWT/crypto tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  issueAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../auth-token.js'

describe('auth-token', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-voor-unit-tests-minimaal-32-bytes!'
  })

  describe('issueAccessToken + verifyAccessToken', () => {
    it('geeft een geldig JWT uit en kan hem verifiëren', () => {
      const userId = '00000000-0000-0000-0000-000000000001'
      const tenantId = '00000000-0000-0000-0000-000000000002'
      const role = 'hr_admin' as const

      const token = issueAccessToken(userId, tenantId, role)
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3) // JWT heeft 3 delen

      const claims = verifyAccessToken(token)
      expect(claims.sub).toBe(userId)
      expect(claims.tenantId).toBe(tenantId)
      expect(claims.role).toBe(role)
      expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS)
    })

    it('gooit een fout bij een ongeldig token', () => {
      expect(() => verifyAccessToken('niet.een.jwt')).toThrow()
    })

    it('gooit een fout bij een verlopen token', async () => {
      // Genereer een token met -1s TTL via jwt direct
      const jwt = await import('jsonwebtoken')
      const secret = process.env.JWT_SECRET ?? 'fallback'
      const expired = jwt.default.sign(
        { tenantId: 'x', role: 'hr_admin' },
        secret,
        { subject: 'user-id', expiresIn: -1 },
      )
      expect(() => verifyAccessToken(expired)).toThrow()
    })
  })

  describe('generateRefreshToken + hashRefreshToken', () => {
    it('genereert een 64-char hex string', () => {
      const token = generateRefreshToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('hash is deterministisch', () => {
      const token = generateRefreshToken()
      expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
    })

    it('twee tokens hebben verschillende hashes', () => {
      const t1 = generateRefreshToken()
      const t2 = generateRefreshToken()
      expect(hashRefreshToken(t1)).not.toBe(hashRefreshToken(t2))
    })
  })
})
