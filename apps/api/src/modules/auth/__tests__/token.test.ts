/**
 * Unit tests voor token helpers (JWT + refresh-token generatie).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { issueAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken, refreshTokenExpiresAt, ACCESS_TOKEN_TTL_SECONDS } from '../token.js'

const JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long-abc'

describe('token helpers', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  describe('issueAccessToken + verifyAccessToken', () => {
    it('geeft een geldig JWT terug met correcte claims', () => {
      const userId = '00000000-0000-0000-0000-000000000001'
      const tenantId = '00000000-0000-0000-0000-000000000002'
      const role = 'hr_admin' as const

      const token = issueAccessToken(userId, tenantId, role)
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // header.payload.signature

      const claims = verifyAccessToken(token)
      expect(claims.sub).toBe(userId)
      expect(claims.tenantId).toBe(tenantId)
      expect(claims.role).toBe(role)
      expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS)
    })

    it('gooit bij een ongeldig token', () => {
      expect(() => verifyAccessToken('invalid.jwt.token')).toThrow()
    })

    it('gooit bij een token ondertekend met een ander secret', () => {
      process.env.JWT_SECRET = 'other-secret-min-32-chars-xxxxxxxxxxx'
      const token = issueAccessToken(
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        'employee',
      )
      process.env.JWT_SECRET = JWT_SECRET
      expect(() => verifyAccessToken(token)).toThrow()
    })
  })

  describe('generateRefreshToken', () => {
    it('geeft een 64-char hex string terug', () => {
      const token = generateRefreshToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('genereert unieke tokens', () => {
      const t1 = generateRefreshToken()
      const t2 = generateRefreshToken()
      expect(t1).not.toBe(t2)
    })
  })

  describe('hashRefreshToken', () => {
    it('geeft een reproduceerbare sha256-hash terug', () => {
      const token = 'abc123'
      const hash1 = hashRefreshToken(token)
      const hash2 = hashRefreshToken(token)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[0-9a-f]{64}$/) // sha256 = 64 hex chars
    })

    it('geeft verschillende hashes voor verschillende tokens', () => {
      expect(hashRefreshToken('token1')).not.toBe(hashRefreshToken('token2'))
    })
  })

  describe('refreshTokenExpiresAt', () => {
    it('geeft een datum ~7 dagen in de toekomst terug', () => {
      const before = Date.now()
      const expiresAt = refreshTokenExpiresAt()
      const after = Date.now()

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 100)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 100)
    })
  })
})
