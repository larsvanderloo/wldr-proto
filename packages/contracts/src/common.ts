import { z } from 'zod'

/**
 * Gedeelde primitieven voor alle contracts.
 * Single source of truth — geen duplicatie in web/ of api/.
 */

export const uuidSchema = z.string().uuid()

export const tenantContextSchema = z.object({
  tenantId: uuidSchema,
  userId: uuidSchema,
})

export const timestampsSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export function paginatedResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}

// RFC 7807 Problem Details
export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

export type ProblemDetails = z.infer<typeof problemDetailsSchema>
