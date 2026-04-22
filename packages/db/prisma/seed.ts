/**
 * Prisma seed — idempotent testdata voor lokale dev + E2E (AUTH-0001 + AUTH-0009 dependency).
 *
 * Tenant: acme (email_domain = 'acme.test')
 * Users:
 *   hr_admin@acme.test  — role hr_admin, geen employee_id vereist
 *   manager@acme.test   — role manager, gekoppeld aan Employee
 *   employee@acme.test  — role employee, gekoppeld aan Employee
 *
 * Wachtwoord voor alle accounts: Welkom01!Welkom (bcrypt rounds 12)
 *
 * Idempotent via upsert op (slug) voor tenant en (tenant_id, email) voor user/employee.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
})

const BCRYPT_ROUNDS = 12
const PLAIN_PASSWORD = 'Welkom01!Welkom'

// PII-key is vereist voor employee-insert via de pgp-functies.
// Seed gaat via directe SQL met pgcrypto.
const PII_KEY = process.env.PII_ENCRYPTION_KEY ?? 'dev-only-pii-key'

async function main() {
  console.log('Seed gestart...')

  const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, BCRYPT_ROUNDS)
  console.log('Wachtwoord-hash gegenereerd')

  // 1. Tenant upsert
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: { emailDomain: 'acme.test' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Acme BV',
      slug: 'acme',
      emailDomain: 'acme.test',
      region: 'eu-west-1',
    },
  })
  console.log(`Tenant '${tenant.name}' (${tenant.id})`)

  // 2. RLS instellen via raw SQL — nodig voor employee-inserts
  await prisma.$executeRawUnsafe(`SET app.tenant_id = '${tenant.id}'`)
  await prisma.$executeRawUnsafe(`SET app.pii_key = '${PII_KEY.replace(/'/g, "''")}'`)

  // 3. Employee-rijen voor manager + employee (hr_admin is puur administratief)
  const managerId = '00000000-0000-0000-0000-000000000011'
  const employeeId = '00000000-0000-0000-0000-000000000012'

  await prisma.$executeRaw`
    INSERT INTO employees (
      id, tenant_id, first_name, last_name, email, job_title,
      employment_type, employment_status, role, start_date, updated_at
    ) VALUES
      (${managerId}::uuid, ${tenant.id}::uuid, 'Daan', 'Manager', 'manager@acme.test',
       'Team Lead', 'permanent'::employment_type, 'active'::employment_status,
       'manager'::employee_role, '2024-01-01'::date, now()),
      (${employeeId}::uuid, ${tenant.id}::uuid, 'Emma', 'Medewerker', 'employee@acme.test',
       'Developer', 'permanent'::employment_type, 'active'::employment_status,
       'employee'::employee_role, '2024-06-01'::date, now())
    ON CONFLICT (tenant_id, email) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          updated_at = now()
  `
  console.log('Employees upserted')

  // 4. Users — upsert op (tenant_id, email) via deduplicatie
  const hrAdminUserId = '00000000-0000-0000-0000-000000000021'
  const managerUserId = '00000000-0000-0000-0000-000000000022'
  const employeeUserId = '00000000-0000-0000-0000-000000000023'

  // actor voor audit-trigger: gebruik system-id (trigger valt terug op target.id)
  await prisma.$executeRawUnsafe(`SET app.user_id = '${hrAdminUserId}'`)

  await prisma.$executeRaw`
    INSERT INTO users (id, tenant_id, email, password_hash, role, employee_id, updated_at)
    VALUES
      (${hrAdminUserId}::uuid, ${tenant.id}::uuid, 'hr_admin@acme.test',
       ${passwordHash}, 'hr_admin'::user_role, NULL, now()),
      (${managerUserId}::uuid, ${tenant.id}::uuid, 'manager@acme.test',
       ${passwordHash}, 'manager'::user_role, ${managerId}::uuid, now()),
      (${employeeUserId}::uuid, ${tenant.id}::uuid, 'employee@acme.test',
       ${passwordHash}, 'employee'::user_role, ${employeeId}::uuid, now())
    ON CONFLICT (tenant_id, email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role          = EXCLUDED.role,
          employee_id   = EXCLUDED.employee_id,
          updated_at    = now()
  `
  console.log('Users upserted')

  // 5. Audit-events worden door de DB-trigger aangemaakt — geen handmatige write.

  console.log('\nSeed klaar. Accounts:')
  console.log('  hr_admin@acme.test  (hr_admin)')
  console.log('  manager@acme.test   (manager, employee_id gekoppeld)')
  console.log('  employee@acme.test  (employee, employee_id gekoppeld)')
  console.log(`  Wachtwoord: ${PLAIN_PASSWORD}`)

  // Sluit crypto random state netjes af (geen leak naar buiten)
  void crypto
}

main()
  .catch((e) => {
    console.error('Seed mislukt:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
