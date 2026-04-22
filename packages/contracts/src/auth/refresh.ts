import { z } from 'zod'

/**
 * RefreshRequest — er is GEEN body. Het refresh-token komt mee als
 * httpOnly-cookie (`hr_refresh`). De CSRF-double-submit komt mee als
 * `X-CSRF-Token`-header met de waarde uit de niet-httpOnly `hr_csrf`-cookie.
 *
 * Zie ADR-0006 § 1+2.
 */
export const refreshRequestSchema = z.object({}).strict()
export type RefreshRequest = z.infer<typeof refreshRequestSchema>

/**
 * RefreshResponse — exact dezelfde shape als LoginResponse:
 * een nieuw access-token. Het nieuwe refresh-token wordt server-side
 * als nieuwe httpOnly-cookie gezet (rotatie).
 */
export const refreshResponseSchema = z.object({
  access_token: z.string().min(20),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
})
export type RefreshResponse = z.infer<typeof refreshResponseSchema>

/**
 * LogoutResponse — leeg. Server clears refresh + csrf cookies en revoked
 * de refresh-token rij in de DB.
 */
export const logoutResponseSchema = z.object({}).strict()
export type LogoutResponse = z.infer<typeof logoutResponseSchema>
