/**
 * TenantContext plugin — backward-compat shim (AUTH-0008).
 *
 * Sprint 1 gebruikte x-tenant-id / x-user-id / x-user-role headers.
 * Sprint 2: deze headers zijn VERWIJDERD. De echte context komt uit
 * de auth-context plugin (JWT → request.user).
 *
 * Dit plugin biedt nog steeds de `req.tenantId` / `req.userId` / `req.userRole`
 * properties voor backward-compat met bestaande employee-service aanroepen.
 * Ze worden gevuld vanuit request.user (gezet door auth-context plugin).
 *
 * BELANGRIJK: auth-context plugin MOET vóór tenant-context geregistreerd zijn.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import type { JwtClaims } from '@hr-saas/contracts/auth'

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    userId: string
    userRole: JwtClaims['role']
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    // Vul tenantId/userId/userRole vanuit request.user (auth-context output).
    // Op publieke routes is request.user null — dan blijven de properties leeg.
    // De employee-service assertUser() blokkeert calls zonder request.user.
    if (req.user) {
      req.tenantId = req.user.tenantId
      req.userId = req.user.id
      req.userRole = req.user.role
    }
  })
}

export const tenantContextPlugin = fp(plugin, {
  name: 'tenant-context',
  dependencies: ['auth-context'],
})
