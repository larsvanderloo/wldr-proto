import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

/**
 * TenantContext plugin.
 *
 * In productie wordt de tenant afgeleid uit een gevalideerde sessie-cookie of
 * JWT. Voor de seed lezen we `x-tenant-id` + `x-user-id` headers. De auth-agent
 * vervangt dit door echte sessieverificatie.
 *
 * De waarden worden op de request gezet, maar de ENIGE bindende tenant-scoping
 * gebeurt in de repository-laag via `withTenant()` — die zet `app.tenant_id`
 * binnen de transactie zodat RLS-policies filteren.
 */

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    userId: string
    userRole: 'admin' | 'manager' | 'employee'
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    // Health-check en openbare endpoints overslaan
    if (req.url === '/healthz' || req.url.startsWith('/v1/auth/')) return

    const tenantId = req.headers['x-tenant-id']
    const userId = req.headers['x-user-id']
    const userRole = req.headers['x-user-role']

    if (typeof tenantId !== 'string' || typeof userId !== 'string') {
      return reply.code(401).send({
        type: 'https://hr-saas.example/problems/unauthenticated',
        title: 'Niet geauthenticeerd',
        status: 401,
        detail: 'Tenant- of user-context ontbreekt.',
      })
    }

    req.tenantId = tenantId
    req.userId = userId
    req.userRole = (userRole as 'admin' | 'manager' | 'employee') ?? 'employee'

    req.log = req.log.child({ tenantId, userId })
  })
}

export const tenantContextPlugin = fp(plugin, { name: 'tenant-context' })
