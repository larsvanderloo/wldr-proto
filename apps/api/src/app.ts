import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'

import { tenantContextPlugin } from './plugins/tenant-context.js'
import { errorHandler } from './plugins/error-handler.js'
import { employeesModule } from './modules/employees/controller.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Serializers verwijderen PII uit logs — nooit zichtbaar.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.bsn',
          'req.body.iban',
          'req.body.phoneNumber',
          'req.body.address',
          '*.bsn',
          '*.iban',
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
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => `${req.ip}:${(req as any).tenantId ?? 'anon'}`,
  })

  await app.register(tenantContextPlugin)

  app.get('/healthz', async () => ({ status: 'ok' }))

  await app.register(employeesModule, { prefix: '/v1' })

  return app
}
