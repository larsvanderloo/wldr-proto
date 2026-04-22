/**
 * Zod-validatie helpers voor Nitro-route-handlers.
 *
 * Alle routes MOETEN deze helpers gebruiken — nooit raw `readBody` zonder Zod.
 * Fouten worden als RFC 7807 Problem Details teruggestuurd (400 / 422).
 */

import { type H3Event, readBody, getQuery, createError } from 'h3'
import type { ZodType, ZodError } from 'zod'

function zodIssuesToErrors(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * Lees + valideer de request-body via een Zod-schema.
 * Throwt `createError({ statusCode: 400 })` bij een ZodError.
 */
export async function validateBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const raw = await readBody(event)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validatiefout',
      data: {
        type: 'https://hr-saas.example/problems/validation',
        title: 'Validatiefout',
        status: 400,
        errors: zodIssuesToErrors(result.error),
      },
    })
  }
  return result.data
}

/**
 * Lees + valideer query-parameters via een Zod-schema.
 * `getQuery` geeft `Record<string, string>` — het schema casts waar nodig.
 * Throwt `createError({ statusCode: 400 })` bij een ZodError.
 */
export function validateQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const raw = getQuery(event)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ongeldige query-parameters',
      data: {
        type: 'https://hr-saas.example/problems/validation',
        title: 'Ongeldige query-parameters',
        status: 400,
        errors: zodIssuesToErrors(result.error),
      },
    })
  }
  return result.data
}
