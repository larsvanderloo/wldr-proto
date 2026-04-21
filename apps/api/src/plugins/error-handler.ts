import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

/**
 * Uniforme error handler — RFC 7807 Problem Details.
 * Nooit stack traces of PII naar de client.
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

  reply.code(status).send({
    type: `https://hr-saas.example/problems/${status === 500 ? 'internal' : 'error'}`,
    title: status === 500 ? 'Interne fout' : err.message,
    status,
    detail: status === 500 ? undefined : err.message,
  })
}
