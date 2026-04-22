/**
 * GET /api/v1/employees — lijst medewerkers (RBAC-gefiltered)
 *
 * Beveiligd pad — JWT vereist (02.auth-context.ts).
 * RBAC: hr_admin ziet alles, manager ziet eigen team, employee ziet zichzelf.
 * Paginering via cursor (keyset) — limit max 100.
 */

import { defineEventHandler } from 'h3'
import { employeeListQuerySchema, type EmployeeListQuery } from '@hr-saas/contracts/employees'
import { validateQuery } from '../../../utils/validate.js'
import { buildEmployeesContext } from '../../../utils/auth.js'
import * as service from '../../../services/employees/service.js'

export default defineEventHandler(async (event) => {
  // Zod-defaults (limit=25, sortBy='lastName', sortDir='asc') zijn aanwezig
  // maar TypeScript ziet de type vóór het schema de defaults toepast.
  // Cast naar de verwachte output-type na validatie.
  const query = validateQuery(event, employeeListQuerySchema) as EmployeeListQuery
  const ctx = buildEmployeesContext(event)
  return service.list(ctx, query)
})
