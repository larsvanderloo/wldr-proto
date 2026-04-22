import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'

import { authContextPlugin } from './plugins/auth-context.js'
import { errorHandler } from './plugins/error-handler.js'
import { authModule } from './modules/auth/controller.js'
import { employeesModule } from './modules/employees/controller.js'

/**
 * Parseer CORS_ALLOWED_ORIGINS uit de omgeving.
 * Formaat: komma-separated lijst van origins, bijv. "https://app.larsvdloo.com,https://staging.larsvdloo.com"
 * Default lokaal: "http://localhost:3000"
 *
 * Wildcard (*) is nooit toegestaan — credentials: true en wildcard verdragen
 * elkaar niet (CORS-spec) en lekken sessies naar willekeurige origins.
 */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000'
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean)

  if (origins.includes('*')) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS mag geen wildcard (*) bevatten — dit is incompatibel met credentials: true en vormt een beveiligingsrisico.',
    )
  }

  return origins
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Serializers verwijderen PII uit logs — nooit zichtbaar.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.bsn',
          'req.body.iban',
          'req.body.phoneNumber',
          'req.body.address',
          '*.bsn',
          '*.iban',
          '*.password',
          '*.passwordHash',
          '*.password_hash',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: true,
    disableRequestLogging: false,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: parseCorsOrigins(),
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tenantId is nog niet gedecoreerd op dit moment
    keyGenerator: (req) => `${req.ip}:${(req as any).user?.tenantId ?? 'anon'}`,
  })

  // Cookie-plugin — vereist voor httpOnly refresh-token (ADR-0006)
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-only-cookie-secret-change-in-production',
  })

  // Auth-context plugin: JWT-validatie + request.user decoratie.
  // Geregistreerd VOOR de route-modules zodat hooks actief zijn op alle routes.
  await app.register(authContextPlugin)

  app.get('/healthz', {
    config: { public: true },
    handler: async () => ({ status: 'ok' }),
  })

  await app.register(authModule, { prefix: '/v1' })
  await app.register(employeesModule, { prefix: '/v1' })

  return app
}
