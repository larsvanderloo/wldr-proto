import { z } from 'zod'
import { timestampsSchema, uuidSchema } from '../common.js'

/**
 * Employee — kernentiteit.
 * Sensitive velden (BSN, IBAN) zijn NOOIT in de list-response. Alleen in detail
 * voor geautoriseerde rollen, en op de wire altijd als masked string tenzij
 * expliciet onthuld via `/employees/:id/reveal` (audit-logged).
 */

export const employmentTypeSchema = z.enum([
  'permanent',
  'fixed_term',
  'freelance',
  'intern',
])
export type EmploymentType = z.infer<typeof employmentTypeSchema>

export const employmentStatusSchema = z.enum([
  'active',
  'on_leave',
  'terminated',
  'pending_start',
])
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>

export const employeeRoleSchema = z.enum(['admin', 'manager', 'employee'])
export type EmployeeRole = z.infer<typeof employeeRoleSchema>

/** Basisvelden die altijd veilig zijn om te tonen. */
export const employeeBaseSchema = z.object({
  id: uuidSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  jobTitle: z.string().min(1).max(120),
  department: z.string().max(120).nullable(),
  managerId: uuidSchema.nullable(),
  employmentType: employmentTypeSchema,
  employmentStatus: employmentStatusSchema,
  role: employeeRoleSchema,
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
})

/** List-item — geen PII. */
export const employeeListItemSchema = employeeBaseSchema.merge(timestampsSchema)
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>

/** Detail — bevat masked versies van sensitive velden. */
export const employeeDetailSchema = employeeListItemSchema.extend({
  phoneNumber: z.string().nullable(),
  /** BSN masked, bv "****1234". Onthullen via aparte endpoint. */
  bsnMasked: z.string().nullable(),
  /** IBAN masked, bv "NL** **** **** **12". */
  ibanMasked: z.string().nullable(),
  address: z
    .object({
      street: z.string(),
      houseNumber: z.string(),
      postalCode: z.string(),
      city: z.string(),
      country: z.string().length(2),
    })
    .nullable(),
})
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>
