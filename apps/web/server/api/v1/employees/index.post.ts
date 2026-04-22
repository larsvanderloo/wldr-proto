/**
 * POST /api/v1/employees — maak nieuwe medewerker aan
 *
 * Beveiligd pad — JWT vereist, hr_admin only (service-laag enforced).
 * Audit-log in dezelfde transactie (via repository).
 * Response: 201 + employeeId als string.
 */

import { defineEventHandler, setResponseStatus } from 'h3'
import { createEmployeeInputSchema, type CreateEmployeeInput } from '@hr-saas/contracts/employees'
import { validateBody } from '../../../utils/validate.js'
import { buildEmployeesContext } from '../../../utils/auth.js'
import * as service from '../../../services/employees/service.js'

export default defineEventHandler(async (event) => {
  // Zod-default op `role` = 'employee' — cast naar output-type na validatie
  const body = await validateBody(event, createEmployeeInputSchema) as CreateEmployeeInput
  const ctx = buildEmployeesContext(event)
  const id = await service.create(ctx, body)
  setResponseStatus(event, 201)
  return { id }
})
