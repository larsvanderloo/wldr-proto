/**
 * Programmatische seed-helper voor integration tests.
 *
 * Doel: CI heeft een lege Postgres na `prisma migrate deploy` — geen seed-script
 * gedraaid. Deze helper voert dezelfde data in als packages/db/prisma/seed.ts,
 * maar dan vanuit de test-suite zelf (in beforeAll) zodat het CI-onafhankelijk is.
 *
 * Idempotent: ON CONFLICT DO UPDATE — veilig om meerdere keren aan te roepen.
 *
 * RLS-aanpak: de audit-trigger op `users` schrijft naar `audit_events` die RLS
 * heeft met FORCE ROW LEVEL SECURITY. Om dit tijdens seeding te laten werken
 * zetten we `app.tenant_id` en `app.user_id` via SET (session-level, niet LOCAL)
 * vóór de INSERT — daarna resetten we naar een lege string. Dit is uitsluitend
 * acceptabel in een test-context (geïsoleerde DB per CI-run).
 *
 * Importeert PrismaClient via @hr-saas/db (niet direct @prisma/client) zodat
 * @hr-saas/api geen extra dependency op @prisma/client nodig heeft.
 */

import type { PrismaClient } from '@hr-saas/db'
import bcrypt from 'bcryptjs'

// Vastgepinde test-UUIDs — identiek aan seed.ts voor voorspelbaarheid.
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_MANAGER_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000011'
export const TEST_EMPLOYEE_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000012'
export const TEST_HR_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000021'
export const TEST_MANAGER_USER_ID = '00000000-0000-0000-0000-000000000022'
export const TEST_EMPLOYEE_USER_ID = '00000000-0000-0000-0000-000000000023'

export const TEST_PLAIN_PASSWORD = 'Welkom01!Welkom'
export const TEST_TENANT_SLUG = 'acme'
export const TEST_EMAIL_DOMAIN = 'acme.test'
export const TEST_HR_ADMIN_EMAIL = 'hr_admin@acme.test'
export const TEST_MANAGER_EMAIL = 'manager@acme.test'
export const TEST_EMPLOYEE_EMAIL = 'employee@acme.test'

const BCRYPT_ROUNDS = 12

/**
 * Seed de test-database programmatisch.
 * Roep aan in `beforeAll` van integration tests.
 */
export async function seedTestDatabase(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(TEST_PLAIN_PASSWORD, BCRYPT_ROUNDS)
  const piiKey = process.env.PII_ENCRYPTION_KEY ?? 'dev-only-pii-key'

  // 1. Tenant
  await prisma.tenant.upsert({
    where: { slug: TEST_TENANT_SLUG },
    update: { emailDomain: TEST_EMAIL_DOMAIN },
    create: {
      id: TEST_TENANT_ID,
      name: 'Acme BV',
      slug: TEST_TENANT_SLUG,
      emailDomain: TEST_EMAIL_DOMAIN,
      region: 'eu-west-1',
    },
  })

  // 2. Zet session-level app-settings voor RLS (audit-trigger vereist dit).
  // SET zonder LOCAL geldt voor de gehele sessie totdat we het resetten.
  // In tests is dit geïsoleerd — de PrismaClient-instantie wordt na de test-suite weggegooid.
  await prisma.$executeRawUnsafe(`SET app.tenant_id = '${TEST_TENANT_ID}'`)
  await prisma.$executeRawUnsafe(`SET app.pii_key = '${piiKey.replace(/'/g, "''")}'`)
  await prisma.$executeRawUnsafe(`SET app.user_id = '${TEST_HR_ADMIN_USER_ID}'`)

  // 3. Employees (vereist app.tenant_id voor RLS-beleid op employees-tabel)
  await prisma.$executeRaw`
    INSERT INTO employees (
      id, tenant_id, first_name, last_name, email, job_title,
      employment_type, employment_status, role, start_date, updated_at
    ) VALUES
      (${TEST_MANAGER_EMPLOYEE_ID}::uuid, ${TEST_TENANT_ID}::uuid,
       'Daan', 'Manager', ${TEST_MANAGER_EMAIL},
       'Team Lead', 'permanent'::employment_type, 'active'::employment_status,
       'manager'::employee_role, '2024-01-01'::date, now()),
      (${TEST_EMPLOYEE_EMPLOYEE_ID}::uuid, ${TEST_TENANT_ID}::uuid,
       'Emma', 'Medewerker', ${TEST_EMPLOYEE_EMAIL},
       'Developer', 'permanent'::employment_type, 'active'::employment_status,
       'employee'::employee_role, '2024-06-01'::date, now())
    ON CONFLICT (tenant_id, email) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          updated_at = now()
  `

  // 4. Users — audit-trigger vuurt hier; vereist app.tenant_id + app.user_id in sessie.
  await prisma.$executeRaw`
    INSERT INTO users (id, tenant_id, email, password_hash, role, employee_id, updated_at)
    VALUES
      (${TEST_HR_ADMIN_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid,
       ${TEST_HR_ADMIN_EMAIL}, ${passwordHash}, 'hr_admin'::user_role, NULL, now()),
      (${TEST_MANAGER_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid,
       ${TEST_MANAGER_EMAIL}, ${passwordHash}, 'manager'::user_role,
       ${TEST_MANAGER_EMPLOYEE_ID}::uuid, now()),
      (${TEST_EMPLOYEE_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid,
       ${TEST_EMPLOYEE_EMAIL}, ${passwordHash}, 'employee'::user_role,
       ${TEST_EMPLOYEE_EMPLOYEE_ID}::uuid, now())
    ON CONFLICT (tenant_id, email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role          = EXCLUDED.role,
          employee_id   = EXCLUDED.employee_id,
          updated_at    = now()
  `

  // Reset session-settings — defensief, zodat andere test-queries niet lekken.
  await prisma.$executeRawUnsafe(`SET app.tenant_id = ''`)
  await prisma.$executeRawUnsafe(`SET app.user_id = ''`)
}

/**
 * Verwijder alle test-data (voor teardown als dat nodig is).
 * Niet aanroepen in beforeEach — te traag. Gebruik idempotente seed.
 */
export async function cleanTestDatabase(prisma: PrismaClient): Promise<void> {
  // Zet tenant-context zodat RLS-deletes werken.
  await prisma.$executeRawUnsafe(`SET app.tenant_id = '${TEST_TENANT_ID}'`)
  await prisma.$executeRawUnsafe(`SET app.pii_key = 'dev-only-pii-key'`)

  // Verwijder in de juiste volgorde (FK-constraints).
  await prisma.$executeRaw`DELETE FROM refresh_tokens WHERE tenant_id = ${TEST_TENANT_ID}::uuid`
  await prisma.$executeRaw`DELETE FROM users WHERE tenant_id = ${TEST_TENANT_ID}::uuid`
  await prisma.$executeRaw`DELETE FROM employees WHERE tenant_id = ${TEST_TENANT_ID}::uuid`
  await prisma.$executeRaw`DELETE FROM audit_events WHERE tenant_id = ${TEST_TENANT_ID}::uuid`
  await prisma.$executeRaw`DELETE FROM tenants WHERE id = ${TEST_TENANT_ID}::uuid`

  await prisma.$executeRawUnsafe(`SET app.tenant_id = ''`)
}
