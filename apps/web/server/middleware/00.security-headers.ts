/**
 * Security-headers middleware voor API-routes.
 *
 * Zet `Cache-Control: no-store` op alle `/api/*` paden zodat tussenliggende
 * proxies geen API-responses cachen (inclusief auth-responses).
 *
 * `vercel.json` zet bredere security-headers globaal (CSP, X-Frame, etc.).
 * Dit is het aanvullende API-specifieke stuk.
 */

import { defineEventHandler, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/')) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
  }
})
