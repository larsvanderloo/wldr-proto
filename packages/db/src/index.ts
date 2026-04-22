import { PrismaClient } from '@prisma/client'

/**
 * Tenant-aware Prisma client factory.
 *
 * Gebruik per-request: maak een nieuwe transaction-scoped client met
 * `app.tenant_id` gezet, zodat RLS policies filteren.
 *
 * Backend-code importeert ALTIJD via deze factory, nooit de raw PrismaClient
 * direct. Dat is onze belt-and-suspenders bovenop RLS.
 */

let _prisma: PrismaClient | undefined

/**
 * Client voor pooled reads (PgBouncer / Neon pooler).
 * NIET gebruikt voor withTenant — zie hieronder.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    })
  }
  return _prisma
}

let _prismaDirectCache: PrismaClient | undefined

/**
 * Client die altijd via de directe (unpooled) URL verbindt.
 *
 * Neon pgBouncer draait in transaction-mode. In transaction-mode zijn
 * `SET LOCAL`-GUC-aanroepen niet betrouwbaar: de pooler kan statements in
 * dezelfde Prisma-transactie via verschillende server-connections routeren,
 * waardoor `current_setting('app.tenant_id')` in RLS-policies en triggers
 * een lege waarde ziet.
 *
 * Oplossing: `withTenant` gebruikt uitsluitend de directe (unpooled) connection
 * zodat de TCP-verbinding stabiel is voor de gehele transactie en `SET LOCAL`
 * zijn werk kan doen. Niet-transactionele reads via `getPrisma()` mogen de
 * pooler blijven gebruiken.
 *
 * DIRECT_URL is dezelfde connectie-string als DATABASE_URL maar zonder
 * `?pgbouncer=true` en gericht op de directe Neon endpoint (port 5432).
 * Lokaal en in CI: DIRECT_URL = DATABASE_URL (geen pooler in het pad).
 */
function getPrismaDirect(): PrismaClient {
  if (!_prismaDirectCache) {
    const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
    if (!directUrl) throw new Error('DIRECT_URL (of DATABASE_URL) ontbreekt in environment')
    _prismaDirectCache = new PrismaClient({
      datasources: { db: { url: directUrl } },
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    })
  }
  return _prismaDirectCache
}

/**
 * Voer een callback uit binnen een transactie met tenant + PII-key gezet.
 * Dit is de ENIGE manier om employee-data te lezen of schrijven.
 *
 * Gebruikt altijd de directe (unpooled) connection zodat SET LOCAL
 * betrouwbaar werkt, ook achter Neon pgBouncer.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  const prisma = getPrismaDirect()
  const piiKey = process.env.PII_ENCRYPTION_KEY
  if (!piiKey) throw new Error('PII_ENCRYPTION_KEY ontbreekt in environment')

  return prisma.$transaction(async (tx) => {
    // SET LOCAL — alleen binnen deze transactie, automatisch opgeruimd.
    // Werkt betrouwbaar omdat we de directe (unpooled) connection gebruiken.
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`)
    await tx.$executeRawUnsafe(`SET LOCAL app.pii_key = '${piiKey.replace(/'/g, "''")}'`)
    return callback(tx)
  })
}

/**
 * Voer een callback uit ZONDER tenant-scope (geen RLS-setting).
 *
 * Gebruik uitsluitend voor bootstrapping-queries waarbij de tenant nog niet
 * bekend is: token-hash lookup (refresh/logout flow), tenant-detectie bij login.
 *
 * WAARSCHUWING: deze functie bypass RLS. Gebruik hem alleen voor:
 * 1. SELECT op niet-tenant-scoped tabellen (tenants)
 * 2. Token-hash lookups waarbij we de tenantId willen BEPALEN
 * Nooit voor employee-data of andere PII.
 *
 * De caller is verantwoordelijk voor het beperken van de query tot de
 * minimale benodigde velden (alleen tenant_id — geen user data).
 */
export async function withoutRls<T>(
  callback: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = getPrisma()
  return callback(prisma)
}

export { PrismaClient } from '@prisma/client'
export type { Prisma } from '@prisma/client'
