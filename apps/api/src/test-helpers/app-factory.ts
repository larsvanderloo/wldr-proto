/**
 * Test-helper: bouwt een Fastify-instance met volledige plugin-stack.
 * Gebruik in integration tests — niet voor unit tests.
 */

import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}
