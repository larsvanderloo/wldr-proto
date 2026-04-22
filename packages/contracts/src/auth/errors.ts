import { z } from 'zod'

/**
 * Getypeerde foutcodes voor auth-flows.
 *
 * Conventie: het `error`-veld in de Problem Details body komt uit deze enum.
 * Frontend matched op de string om gerichte UX te bieden:
 *
 *  - `token_expired` → trigger transparante refresh, retry call
 *  - `invalid_credentials` → toon generieke "ongeldig" melding op login-pagina
 *  - `tenant_mismatch` → idem als invalid_credentials (geen info-leak), maar
 *    server-side wel apart loggen voor support-debugging
 *  - `tenant_unknown` → e-mail-domein matched geen tenant; idem 401 generic UI
 *  - `rate_limited` → toon "te veel pogingen, probeer over X minuten opnieuw"
 *  - `csrf_mismatch` → forceer logout (cookie/CSRF-state corrupt)
 *  - `refresh_revoked` → idem
 *  - `password_too_weak` → 422 op register; toon validatie-melding
 *  - `email_already_taken` → 409 op register
 *  - `unauthorized` → 401 catch-all wanneer JWT ontbreekt
 *  - `forbidden` → 403 wanneer rol/permissie niet toereikend is
 */
export const authErrorCodeSchema = z.enum([
  'token_expired',
  'invalid_credentials',
  'tenant_mismatch',
  'tenant_unknown',
  'rate_limited',
  'csrf_mismatch',
  'refresh_revoked',
  'password_too_weak',
  'email_already_taken',
  'unauthorized',
  'forbidden',
])
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>

/**
 * Alle 401-/409-/422-/429-responses van /v1/auth/* hebben deze shape.
 * Compatibel met RFC 7807 (problemDetailsSchema in common.ts) maar met
 * extra `error`-veld voor typed branching aan de frontend-zijde.
 */
export const authErrorResponseSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  error: authErrorCodeSchema,
  /** Bij 429: seconden tot retry mogelijk is. */
  retryAfter: z.number().int().positive().optional(),
})
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>
