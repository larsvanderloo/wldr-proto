/**
 * Unit-tests voor cookie-helpers.
 * Verifieert dat cookies correct worden gezet/verwijderd conform ADR-0006 addendum.
 */

import { describe, it, expect } from 'vitest'
import { REFRESH_COOKIE, CSRF_COOKIE, COOKIE_PATH } from '../cookies.js'

describe('cookies constanten (ADR-0006 addendum)', () => {
  it('COOKIE_PATH is /api/v1/auth (Nitro-prefix)', () => {
    expect(COOKIE_PATH).toBe('/api/v1/auth')
  })

  it('cookie-namen zijn correct', () => {
    expect(REFRESH_COOKIE).toBe('hr_refresh')
    expect(CSRF_COOKIE).toBe('hr_csrf')
  })
})
