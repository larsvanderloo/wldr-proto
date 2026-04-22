/**
 * POST /api/v1/employees/:id/reveal — onthul een PII-veld (BSN of IBAN)
 *
 * Beveiligd pad — JWT vereist, hr_admin only.
 * Elke reveal schrijft een audit-event (in dezelfde transactie in de repository).
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { z } from 'zod'
import { revealFieldInputSchema } from '@hr-saas/contracts/employees'
import { validateBody } from '../../../../utils/validate.js'
import { buildEmployeesContext } from '../../../../utils/auth.js'
import * as service from '../../../../services/employees/service.js'

const uuidSchema = z.string().uuid('Ongeldig employee-ID formaat')

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

  const body = await validateBody(event, revealFieldInputSchema)
  const ctx = buildEmployeesContext(event)

  const result = await service.reveal(ctx, parseResult.data, body.field, body.reason)

  return {
    field: body.field,
    value: result.value,
    auditEventId: result.auditEventId,
  }
})
