/**
 * Unit-tests voor cookie-helpers.
 * Verifieert dat cookies correct worden gezet/verwijderd conform ADR-0006 addendum.
 */

import { describe, it, expect } from 'vitest'
import { REFRESH_COOKIE, CSRF_COOKIE, COOKIE_PATH } from '../cookies.js'

describe('cookies constanten (ADR-0006 addendum rev. 2)', () => {
  it('COOKIE_PATH is / (verbreed van /api/v1/auth voor SSR cookie-doorgifte)', () => {
    // Path=/ zodat browser cookies meestuurt op alle paden en SSR-side $fetch
    // de cookies aantreft in de inkomende request-headers (ADR-0006 rev. 2).
    expect(COOKIE_PATH).toBe('/')
  })

  it('cookie-namen zijn correct', () => {
    expect(REFRESH_COOKIE).toBe('hr_refresh')
    expect(CSRF_COOKIE).toBe('hr_csrf')
  })
})
