import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createEmployeeInputSchema,
  employeeDetailResponseSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  revealFieldInputSchema,
  revealFieldResponseSchema,
  updateEmployeeInputSchema,
} from '@hr-saas/contracts/employees'
import { uuidSchema } from '@hr-saas/contracts'
import * as service from './service.js'

export const employeesModule: FastifyPluginAsync = async (app) => {
  app.get('/employees', {
    schema: {
      querystring: employeeListQuerySchema,
      response: { 200: employeeListResponseSchema },
    },
    handler: async (req) => service.list(req, req.query as never),
  })

  app.get('/employees/:id', {
    schema: {
      params: z.object({ id: uuidSchema }),
      response: { 200: employeeDetailResponseSchema.nullable() },
    },
    handler: async (req) => service.detail(req, (req.params as { id: string }).id),
  })

  app.post('/employees', {
    schema: {
      body: createEmployeeInputSchema,
      response: { 201: z.object({ id: uuidSchema }) },
    },
    handler: async (req, reply) => {
      const id = await service.create(req, req.body as never)
      reply.code(201)
      return { id }
    },
  })

  app.patch('/employees/:id', {
    schema: {
      params: z.object({ id: uuidSchema }),
      body: updateEmployeeInputSchema.omit({ id: true }),
      response: { 200: z.object({ id: uuidSchema }) },
    },
    handler: async (req) => {
      const params = req.params as { id: string }
      const id = await service.update(req, { id: params.id, ...(req.body as object) } as never)
      return { id }
    },
  })

  app.post('/employees/:id/reveal', {
    schema: {
      params: z.object({ id: uuidSchema }),
      body: revealFieldInputSchema,
      response: { 200: revealFieldResponseSchema },
    },
    handler: async (req) => {
      const { id } = req.params as { id: string }
      const { field, reason } = req.body as { field: 'bsn' | 'iban'; reason: string }
      const result = await service.reveal(req, id, field, reason)
      return { field, value: result.value, auditEventId: result.auditEventId }
    },
  })

  app.delete('/employees/:id', {
    schema: {
      params: z.object({ id: uuidSchema }),
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      await service.remove(req, (req.params as { id: string }).id)
      reply.code(204).send()
    },
  })
}
