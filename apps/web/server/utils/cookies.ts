/**
 * Cookie-helpers voor auth — conform ADR-0006 addendum 2026-04-22.
 *
 * Geen `Domain`-attribuut (same-origin, ADR-0007 V4).
 * `Path=/api/v1/auth` (Nitro-prefix vs Fastify's `/v1/auth`).
 * `Secure` alleen in productie. `SameSite=Lax` altijd.
 */

import { type H3Event, setCookie, deleteCookie } from 'h3'

export const REFRESH_COOKIE = 'hr_refresh'
export const CSRF_COOKIE = 'hr_csrf'
export const COOKIE_PATH = '/api/v1/auth'

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

function isSecure(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Zet de refresh- en CSRF-cookies na een succesvolle login of token-rotatie.
 *
 * - `hr_refresh`: httpOnly (JS-ontoegankelijk), Secure (prod), SameSite=Lax,
 *   Path=/api/v1/auth, MaxAge=7d. Geen Domain.
 * - `hr_csrf`: !httpOnly (frontend leest hem voor double-submit header),
 *   Secure (prod), SameSite=Lax, Path=/api/v1/auth, MaxAge=7d. Geen Domain.
 */
export function setAuthCookies(
  event: H3Event,
  refreshToken: string,
  csrfToken: string,
): void {
  const shared = {
    path: COOKIE_PATH,
    secure: isSecure(),
    sameSite: 'lax' as const,
    maxAge: SEVEN_DAYS_SECONDS,
  }

  setCookie(event, REFRESH_COOKIE, refreshToken, {
    ...shared,
    httpOnly: true,
  })

  setCookie(event, CSRF_COOKIE, csrfToken, {
    ...shared,
    httpOnly: false,
  })
}

/**
 * Verwijder beide auth-cookies (logout).
 *
 * `deleteCookie` vereist exact dezelfde `path` als bij `setCookie`.
 * Geen `domain`-arg — identiek aan hoe we ze gezet hebben.
 */
export function clearAuthCookies(event: H3Event): void {
  deleteCookie(event, REFRESH_COOKIE, { path: COOKIE_PATH })
  deleteCookie(event, CSRF_COOKIE, { path: COOKIE_PATH })
}
