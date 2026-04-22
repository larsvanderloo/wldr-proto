/**
 * Logger Nitro-plugin — initialiseert de pino-instance bij Nitro-boot.
 *
 * De top-level `pino()`-aanroep in `utils/logger.ts` vindt plaats bij de
 * eerste import. Deze plugin importeert de module expliciet bij startup
 * zodat de logger-instance warm is vóór de eerste request.
 *
 * Per-request child-logger wordt gezet door `middleware/01.request-log.ts`.
 */

import { logger } from '../utils/logger.js'

export default defineNitroPlugin((_nitroApp) => {
  // Trigger de initialisatie van de top-level pino-instance.
  // De logger is daarna beschikbaar voor alle middleware en handlers.
  logger.info({ event: 'nitro_startup' }, 'Nitro server-logger geïnitialiseerd')
})
