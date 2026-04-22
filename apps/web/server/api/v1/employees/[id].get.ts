/**
 * GET /api/v1/employees/:id — haal één medewerker op
 *
 * Beveiligd pad — JWT vereist.
 * RBAC: hr_admin, manager (eigen team), employee (eigen record).
 * 404 als niet gevonden of buiten scope (geen 403 — zie spec US-4).
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
  const employee = await service.detail(ctx, parseResult.data)

  if (!employee) {
    setResponseStatus(event, 404)
    return null
  }

  return employee
})
