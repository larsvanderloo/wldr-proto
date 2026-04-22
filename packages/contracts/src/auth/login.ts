import { z } from 'zod'

export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  /**
   * Optionele tenant-slug — alleen nodig wanneer email-domein-lookup
   * meerdere of geen tenants oplevert. Frontend toont dit veld pas na
   * een mislukte login (zie ADR-0006 § 3, secundaire flow).
   */
  tenantSlug: z
    .string()
    .regex(/^[a-z0-9-]{2,64}$/, 'Ongeldige tenant-slug')
    .optional(),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/**
 * LoginResponse — refresh_token komt NIET in deze body. Die wordt
 * server-side als httpOnly-cookie gezet (zie ADR-0006).
 *
 * - access_token: JWT, 15 min TTL
 * - expires_in: seconden tot expiry (RFC 6749 § 5.1)
 * - token_type: altijd 'Bearer' (RFC 6750)
 */
export const loginResponseSchema = z.object({
  access_token: z.string().min(20),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
})
export type LoginResponse = z.infer<typeof loginResponseSchema>
