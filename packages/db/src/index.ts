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

export { PrismaClient } from '@prisma/client'
export type { Prisma } from '@prisma/client'
