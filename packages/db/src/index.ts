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

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    })
  }
  return _prisma
}

/**
 * Voer een callback uit binnen een transactie met tenant + PII-key gezet.
 * Dit is de ENIGE manier om employee-data te lezen of schrijven.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  const prisma = getPrisma()
  const piiKey = process.env.PII_ENCRYPTION_KEY
  if (!piiKey) throw new Error('PII_ENCRYPTION_KEY ontbreekt in environment')

  return prisma.$transaction(async (tx) => {
    // SET LOCAL — alleen binnen deze transactie, automatisch opgeruimd.
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
