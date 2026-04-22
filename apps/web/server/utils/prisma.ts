/**
 * Prisma-singleton wrapper voor Nitro server-routes.
 *
 * Re-exporteert `getPrisma`, `withTenant` en `withoutRls` uit `@hr-saas/db`.
 * De singleton-instantie zit in `@hr-saas/db` via `globalThis._prisma`;
 * Vercel function-instances hergebruiken het process tussen invocations
 * binnen dezelfde lambda — geen tweede PrismaClient aanmaken.
 *
 * Connection-pooling: Neon pooled URL via DATABASE_URL (ADR-0005).
 * Geen Neon serverless driver voor Sprint 2.5 — Prisma is voldoende voor demo-load.
 */

export { getPrisma, withTenant, withoutRls } from '@hr-saas/db'
export type { Prisma } from '@hr-saas/db'
