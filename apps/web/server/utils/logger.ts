/**
 * Logger-utility — pino-instance met PII-redaction.
 *
 * Architectuur-stub bij ADR-0007 (V1). Backend vult de implementatie aan
 * tijdens INFRA-0018 (middleware) zodra Nitro-server-routes leven.
 *
 * Conventies (overgenomen van apps/api/src/app.ts buildApp() Fastify-config):
 *   - Eén pino-instance per process — Nitro reused processes binnen een Vercel
 *     function-instance, dus instantiatie aan top-level is veilig (en goedkoper
 *     dan per-request).
 *   - Redaction-paden zijn IDENTIEK aan de Fastify-config zodat compliance
 *     niet regresseert.
 *   - Per-request child-logger: backend doet `event.context.log = log.child({
 *     requestId, userId?, tenantId? })` in `server/middleware/02.request-log.ts`
 *     (zie build plan, sectie middleware).
 *   - Vercel function-logs vangen pino's stdout JSON op; geen extra transport
 *     nodig in productie. Lokaal (`NITRO_PRESET=node-server`) krijgt de logger
 *     `pino-pretty` als dev-dep aanwezig is.
 *
 * Performance-budget (stub-aanname, backend bevestigt na implementatie):
 *   - log.info/debug overhead < 0.5ms p95
 *   - log.child() < 0.1ms p95
 */

import { pino, type Logger, type LoggerOptions } from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Redact-paden 1-op-1 overgenomen van apps/api/src/app.ts. NIET aanpassen
  // zonder ADR-update — dit is de PII-compliance-grens.
  redact: {
    paths: [
      // Headers
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Bodies — auth
      'req.body.password',
      'req.body.password_hash',
      'req.body.passwordHash',
      // Bodies — employee PII
      'req.body.bsn',
      'req.body.iban',
      'req.body.phoneNumber',
      'req.body.address',
      // Wildcard-paden voor genested objecten
      '*.bsn',
      '*.iban',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
    ],
    censor: '[redacted]',
  },
  // Error-serializer staat default aan in pino; hij verbergt geen PII
  // automatisch — we vertrouwen op de redact-paden hierboven.
  base: {
    // Service-identifier voor centrale log-aggregatie zodra we Datadog/Grafana
    // aansluiten (post-Sprint 2.5). Lokaal handig voor `jq`-filtering.
    service: 'hr-saas-web',
    env: process.env.NODE_ENV ?? 'development',
  },
}

// Lokaal (geen Vercel preset) krijgen we leesbare logs als pino-pretty
// gebundeld is. In productie: pure JSON naar stdout — Vercel slurpt het op.
const transport = !isProduction
  ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
  : undefined

export const logger: Logger = pino({
  ...baseOptions,
  ...(transport ? { transport } : {}),
})

/**
 * Maak een per-request child-logger met correlation-id en (optioneel) auth-context.
 * Aangeroepen door `server/middleware/02.request-log.ts` na auth-context.
 */
export function requestLogger(opts: {
  requestId: string
  userId?: string
  tenantId?: string
  method?: string
  url?: string
}): Logger {
  return logger.child({
    requestId: opts.requestId,
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    ...(opts.method ? { method: opts.method } : {}),
    ...(opts.url ? { url: opts.url } : {}),
  })
}

export type { Logger } from 'pino'
