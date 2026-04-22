/**
 * Gedeelde type-definities voor auth-context in Nitro server-routes.
 *
 * `AuthContext` vervangt de Fastify-specifieke `FastifyRequest` in de service-laag.
 * De service-functies nemen dit generieke object aan zodat ze platformonafhankelijk zijn.
 */

import type { Logger } from 'pino'

export type UserRole = 'hr_admin' | 'manager' | 'employee'

/**
 * Auth-context die elke service-functie nodig heeft.
 * Gebouwd vanuit `event.context` in de route-handler.
 */
export interface AuthContext {
  ip: string
  log: Logger
  user: { id: string; tenantId: string; role: UserRole } | null
}

/**
 * AuthContext waarbij de user verplicht aanwezig is.
 * Gebruikt voor employee-routes en register (vereist hr_admin).
 */
export interface AuthenticatedContext extends AuthContext {
  user: { id: string; tenantId: string; role: UserRole }
}

// Uitbreid de Nitro/H3 event-context
declare module 'h3' {
  interface H3EventContext {
    requestId: string
    log: Logger
    user?: {
      id: string
      tenantId: string
      role: UserRole
    }
  }
}
