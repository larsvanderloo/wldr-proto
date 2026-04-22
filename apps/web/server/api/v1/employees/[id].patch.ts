/**
 * PATCH /api/v1/employees/:id — update medewerkergegevens
 *
 * Beveiligd pad — JWT vereist.
 * RBAC: hr_admin (alles), manager (geen rol/status), employee (verboden in Sprint 2).
 * Audit-log in dezelfde transactie (via repository).
 */

import { defineEventHandler, getRouterParam, createError, readBody } from 'h3'
import { z } from 'zod'
import { updateEmployeeInputSchema } from '@hr-saas/contracts/employees'
import { buildEmployeesContext } from '../../../utils/auth.js'
import * as service from '../../../services/employees/service.js'

const uuidSchema = z.string().uuid('Ongeldig employee-ID formaat')

const patchBodySchema = updateEmployeeInputSchema.omit({ id: true })

export default defineEventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id')
  const parseResult = uuidSchema.safeParse(rawId)

  if (!parseResult.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ongeldig ID-formaat',
      data: {
        type: 'https://hr-saas.example/problems/validation',
        title: 'Ongeldig ID-formaat',
        status: 400,
        error: 'invalid_id',
      },
    })
  }

  const rawBody = await readBody(event)
  const bodyResult = patchBodySchema.safeParse(rawBody)

  if (!bodyResult.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validatiefout',
      data: {
        type: 'https://hr-saas.example/problems/validation',
        title: 'Validatiefout',
        status: 400,
        errors: bodyResult.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  }

  const ctx = buildEmployeesContext(event)
  const id = await service.update(ctx, { id: parseResult.data, ...bodyResult.data })
  return { id }
})
