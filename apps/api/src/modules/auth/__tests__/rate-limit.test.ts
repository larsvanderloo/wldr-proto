/**
 * Unit tests voor in-memory rate-limiter.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordFailedAttempt,
  isRateLimited,
  clearRateLimit,
  _resetAllBuckets,
} from '../rate-limit.js'

describe('rate-limit', () => {
  beforeEach(() => {
    _resetAllBuckets()
  })

  describe('recordFailedAttempt', () => {
    it('is niet geblokkeerd na 1 poging', () => {
      const result = recordFailedAttempt('1.2.3.4', 'user@example.com')
      expect(result.blocked).toBe(false)
    })

    it('is niet geblokkeerd na 3 pogingen', () => {
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      const result = recordFailedAttempt('1.2.3.4', 'user@example.com')
      expect(result.blocked).toBe(false)
    })

    it('is geblokkeerd na 4 pogingen', () => {
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      const result = recordFailedAttempt('1.2.3.4', 'user@example.com')
      expect(result.blocked).toBe(true)
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
    })

    it('behandelt case-insensitive email', () => {
      recordFailedAttempt('1.2.3.4', 'USER@EXAMPLE.COM')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'User@Example.Com')
      const result = recordFailedAttempt('1.2.3.4', 'user@example.com')
      expect(result.blocked).toBe(true)
    })

    it('isoleert op IP-adres', () => {
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')

      // Ander IP — niet geblokkeerd
      const result = recordFailedAttempt('5.6.7.8', 'user@example.com')
      expect(result.blocked).toBe(false)
    })
  })

  describe('isRateLimited', () => {
    it('is false zonder eerdere pogingen', () => {
      const result = isRateLimited('1.2.3.4', 'new@example.com')
      expect(result.blocked).toBe(false)
    })

    it('is true na overschrijding', () => {
      recordFailedAttempt('1.2.3.4', 'limited@example.com')
      recordFailedAttempt('1.2.3.4', 'limited@example.com')
      recordFailedAttempt('1.2.3.4', 'limited@example.com')
      recordFailedAttempt('1.2.3.4', 'limited@example.com')

      const result = isRateLimited('1.2.3.4', 'limited@example.com')
      expect(result.blocked).toBe(true)
    })
  })

  describe('clearRateLimit', () => {
    it('reset de teller zodat nieuwe pogingen niet meer geblokkeerd zijn', () => {
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')
      recordFailedAttempt('1.2.3.4', 'user@example.com')

      clearRateLimit('1.2.3.4', 'user@example.com')

      const result = isRateLimited('1.2.3.4', 'user@example.com')
      expect(result.blocked).toBe(false)
    })
  })
})
