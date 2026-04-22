/**
 * Request-log middleware — maakt per-request child-logger.
 *
 * Draait na `00.request-id.ts` zodat `event.context.requestId` al gezet is.
 * De child-logger wordt later verrijkt door `02.auth-context.ts` met
 * `userId` en `tenantId` zodra de JWT geverifieerd is.
 */

import { defineEventHandler } from 'h3'
import { requestLogger } from '../utils/logger.js'

export default defineEventHandler((event) => {
  event.context.log = requestLogger({
    requestId: event.context.requestId ?? 'unknown',
    method: event.method,
    url: event.path,
  })
})
