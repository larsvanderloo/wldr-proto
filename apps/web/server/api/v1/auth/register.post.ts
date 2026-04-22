/**
 * POST /api/v1/auth/register
 *
 * Beveiligd pad — vereist een geldig JWT van een hr_admin.
 * Self-registration is buiten scope (zie ADR-0006 §4).
 *
 * Flow:
 * 1. `02.auth-context.ts` middleware heeft al JWT geverifieerd.
 * 2. Valideer body via Zod (registerRequestSchema).
 * 3. Autorisatie-check in service-laag (hr_admin only).
 * 4. Delegeer aan auth-service (hash + create + audit).
 * 5. Return 201 met id, email, role.
 */

import { defineEventHandler, setResponseStatus } from 'h3'
import { registerRequestSchema } from '@hr-saas/contracts/auth'
import { validateBody } from '../../../utils/validate.js'
import { buildAuthContext } from '../../../utils/auth.js'
import * as service from '../../../services/auth/service.js'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, registerRequestSchema)
  const ctx = buildAuthContext(event)

  const result = await service.register(ctx, body)

  setResponseStatus(event, 201)
  return result
})
