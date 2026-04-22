/**
 * DELETE /api/v1/employees/:id — soft-delete medewerker
 *
 * Beveiligd pad — JWT vereist, hr_admin only (service-laag enforced).
 * Soft-delete: `deleted_at = now()`. Record blijft voor audit-doeleinden.
 * Audit-log in dezelfde transactie (via repository).
 * Response: 204 No Content.
 */

import { defineEventHandler, getRouterParam, createError, setResponseStatus } from 'h3'
import { z } from 'zod'
import { buildEmployeesContext } from '../../../utils/auth.js'
import * as service from '../../../services/employees/service.js'

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

  const ctx = buildEmployeesContext(event)
  await service.remove(ctx, parseResult.data)
  setResponseStatus(event, 204)
  return null
})
