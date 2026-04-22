import { z } from 'zod'
import { uuidSchema } from '../common.js'

/**
 * Rolmodel — basis RBAC voor MVP.
 * Zie ADR-0006 § 4 voor de relatie role ↔ employees.employee_id.
 */
export const roleSchema = z.enum(['hr_admin', 'manager', 'employee'])
export type Role = z.infer<typeof roleSchema>

/**
 * UserSchema — wordt gebruikt voor `request.user`-context na JWT-validatie
 * en voor de payload van JWT-claims (sub = id).
 *
 * Geen passwordHash, geen employeeId — die zijn server-only / lookup-only.
 */
export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email().max(254),
  role: roleSchema,
  tenantId: uuidSchema,
})
export type User = z.infer<typeof userSchema>

/**
 * JWT-claims — exact wat in het access-token zit.
 * sub = user.id, conform RFC 7519.
 */
export const jwtClaimsSchema = z.object({
  sub: uuidSchema,
  tenantId: uuidSchema,
  role: roleSchema,
  iat: z.number().int(),
  exp: z.number().int(),
})
export type JwtClaims = z.infer<typeof jwtClaimsSchema>
