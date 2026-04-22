import { z } from 'zod'
import { uuidSchema } from '../common.js'
import { roleSchema } from './user.js'

/**
 * Wachtwoord-policy — zie spec FEAT-0002 NFR + ADR-0006.
 * Minimum 12 tekens (NIST SP 800-63B aanbeveling voor user-chosen passwords);
 * geen verplichte complexity-rules (NIST raadt af). Lengte > complexity.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Wachtwoord moet minimaal 12 tekens zijn')
  .max(256, 'Wachtwoord is te lang')

export const registerRequestSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
  /**
   * Optioneel — alleen gebruikt door hr_admin die andere users registreert.
   * Self-registration is voorlopig niet ondersteund (out of scope Sprint 2).
   * Default: 'employee' aan service-zijde.
   */
  role: roleSchema.optional(),
  /**
   * Optioneel — koppel direct aan een bestaande employee. Verplicht bij
   * role 'employee' / 'manager' (gevalideerd in service-laag, niet hier:
   * de service heeft zicht op de bestaande employee-records).
   */
  employeeId: uuidSchema.optional(),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * RegisterResponse — geen passwordHash, geen tokens.
 * Registratie logt de gebruiker NIET in — dat is een aparte stap.
 */
export const registerResponseSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  role: roleSchema,
})
export type RegisterResponse = z.infer<typeof registerResponseSchema>
