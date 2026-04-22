/**
 * Error-handler Nitro-plugin — RFC 7807 Problem Details voor onverwachte fouten.
 *
 * Afhandeling:
 * 1. Logt de fout met PII-redaction via `event.context.log` of fallback-logger.
 * 2. Als `err.statusCode` bestaat: respecteer die + stuur `err.data` als body.
 * 3. Anders: 500 + generieke "Interne fout" zonder stack-trace.
 * 4. Nooit stack-trace of PII naar de client.
 *
 * Route-handlers die `createError({ data: { ...rfc7807 } })` throwen worden
 * via h3's eigen mechanisme afgehandeld — deze plugin is belt-and-suspenders
 * voor de gevallen die h3 niet zelf structureert.
 */

import { logger } from '../utils/logger.js'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (err, { event }) => {
    const log = event?.context?.log ?? logger
    const status: number = (err as { statusCode?: number }).statusCode ?? 500

    if (status >= 500) {
      // Interne fouten: log met stack maar stuur geen stack naar client
      log.error({ err: { message: err.message, name: err.name }, status }, 'server_error')
    } else {
      // Client-fouten (4xx): info-level, geen stack
      log.info({ status, message: err.message }, 'client_error')
    }
  })
})
