/**
 * GET /api/v1/healthz — minimale health-check.
 *
 * Publiek pad (overgeslagen door 02.auth-context.ts middleware).
 * Gebruikt door CI smoke-test en deploy-pipeline.
 */

export default defineEventHandler(() => ({ status: 'ok' }))
