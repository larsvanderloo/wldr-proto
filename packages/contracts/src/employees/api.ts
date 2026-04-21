import { z } from 'zod'
import { paginatedResponse, paginationQuerySchema, uuidSchema } from '../common.js'
import {
  employeeDetailSchema,
  employeeListItemSchema,
  employeeRoleSchema,
  employmentStatusSchema,
  employmentTypeSchema,
} from './schemas.js'

/** NL BSN-validatie (11-proef). */
const bsnSchema = z
  .string()
  .regex(/^\d{9}$/, 'BSN moet 9 cijfers zijn')
  .refine((bsn) => {
    const d = bsn.split('').map(Number)
    const sum =
      d[0] * 9 + d[1] * 8 + d[2] * 7 + d[3] * 6 + d[4] * 5 + d[5] * 4 + d[6] * 3 + d[7] * 2 + d[8] * -1
    return sum % 11 === 0
  }, 'BSN voldoet niet aan de 11-proef')

/** NL IBAN — basisformaat, volledige mod-97 wordt server-side gevalideerd. */
const ibanSchema = z
  .string()
  .regex(/^NL\d{2}[A-Z]{4}\d{10}$/, 'Ongeldige NL IBAN-formaat')

export const createEmployeeInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  jobTitle: z.string().min(1).max(120),
  department: z.string().max(120).optional(),
  managerId: uuidSchema.optional(),
  employmentType: employmentTypeSchema,
  role: employeeRoleSchema.default('employee'),
  startDate: z.string().date(),
  phoneNumber: z.string().max(32).optional(),
  bsn: bsnSchema.optional(),
  iban: ibanSchema.optional(),
  address: z
    .object({
      street: z.string().min(1).max(120),
      houseNumber: z.string().min(1).max(16),
      postalCode: z.string().regex(/^\d{4}\s?[A-Z]{2}$/i, 'Ongeldige postcode'),
      city: z.string().min(1).max(120),
      country: z.string().length(2).default('NL'),
    })
    .optional(),
})
export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>

export const updateEmployeeInputSchema = createEmployeeInputSchema.partial().extend({
  id: uuidSchema,
  employmentStatus: employmentStatusSchema.optional(),
  endDate: z.string().date().nullable().optional(),
})
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>

export const employeeListQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  status: employmentStatusSchema.optional(),
  sortBy: z.enum(['lastName', 'startDate', 'department']).default('lastName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>

export const employeeListResponseSchema = paginatedResponse(employeeListItemSchema)
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>

export const employeeDetailResponseSchema = employeeDetailSchema
export type EmployeeDetailResponse = z.infer<typeof employeeDetailResponseSchema>

/** Onthul een sensitive veld — roept audit log aan server-side. */
export const revealFieldInputSchema = z.object({
  field: z.enum(['bsn', 'iban']),
  reason: z.string().min(3).max(500),
})
export type RevealFieldInput = z.infer<typeof revealFieldInputSchema>

export const revealFieldResponseSchema = z.object({
  field: z.enum(['bsn', 'iban']),
  value: z.string(),
  auditEventId: uuidSchema,
})
export type RevealFieldResponse = z.infer<typeof revealFieldResponseSchema>
