import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

/**
 * Uniforme error handler — RFC 7807 Problem Details.
 * Nooit stack traces of PII naar de client.
 *
 * Auth-fouten: als de error een `authCode` property heeft (gezet door de
 * auth service-laag), wordt dit meegestuurd als `error`-veld in de response
 * (conform authErrorResponseSchema in packages/contracts).
 */
export function errorHandler(
  err: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof ZodError) {
    reply.code(400).send({
      type: 'https://hr-saas.example/problems/validation',
      title: 'Validatiefout',
      status: 400,
      errors: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  const status = err.statusCode ?? 500
  req.log.error({ err }, 'request-fout')

  // Auth-fout: authCode + retryAfter zijn gezet door de service-laag (zie auth/service.ts)
  const errExt = err as FastifyError & { authCode?: string; retryAfter?: number }
  const authCode = errExt.authCode
  const retryAfter = errExt.retryAfter

  reply.code(status).send({
    type: `https://hr-saas.example/problems/${status === 500 ? 'internal' : 'error'}`,
    title: status === 500 ? 'Interne fout' : err.message,
    status,
    detail: status === 500 ? undefined : err.message,
    ...(authCode ? { error: authCode } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  })
}
