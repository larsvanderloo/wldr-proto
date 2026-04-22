import { withTenant, type Prisma } from '@hr-saas/db'
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from '@hr-saas/contracts/employees'

/**
 * Employees repository — DE enige laag die Prisma aanraakt voor employees.
 * Elke functie wrapped in `withTenant` → RLS actief, PII-key beschikbaar.
 */

function maskBsn(bsn: string): string {
  return `*****${bsn.slice(-4)}`
}
function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} **** **** **${iban.slice(-2)}`
}

interface RbacFilter {
  /** employee-rol: filter op user.id via user-join (employee_id op users-tabel) */
  employeeIdFilter?: string
  /** manager-rol: toon eigen record + directe rapporten */
  managerIdFilter?: string
  /** caller's user.id — voor manager "eigen record" */
  callerUserId?: string
}

export async function listEmployees(tenantId: string, query: EmployeeListQuery, rbac?: RbacFilter) {
  return withTenant(tenantId, async (tx) => {
    // RBAC-where:
    // - employee: alleen het employee-record gekoppeld aan de ingelogde user
    // - manager: eigen employee-record + directe rapporten (manager_id = employeeId van caller)
    // - hr_admin: geen extra filter (RLS scopet al op tenant)
    let rbacWhere: Prisma.EmployeeWhereInput = {}

    if (rbac?.employeeIdFilter) {
      // Employee: zoek het employee-record dat gekoppeld is aan de user
      rbacWhere = {
        users: { some: { id: rbac.employeeIdFilter, deletedAt: null } },
      }
    } else if (rbac?.managerIdFilter) {
      // Manager: directe rapporten (manager_id = eigen employee.id)
      // of het eigen employee-record (via user-join)
      rbacWhere = {
        OR: [
          { users: { some: { id: rbac.managerIdFilter, deletedAt: null } } },
          { managerId: { not: null }, users: { some: { id: rbac.managerIdFilter, deletedAt: null } }, manager: { users: { some: { id: rbac.managerIdFilter, deletedAt: null } } } },
        ],
      }
      // Eenvoudigere variant: manager_id via de employee die gelinkt is aan de caller
      // We doen een subquery: welk employee.id heeft de caller?
      // Voor MVP: haal employee.id van de caller op en filter op managerId
      const callerEmployee = await tx.user.findUnique({
        where: { id: rbac.managerIdFilter },
        select: { employeeId: true },
      })
      if (callerEmployee?.employeeId) {
        rbacWhere = {
          OR: [
            { id: callerEmployee.employeeId }, // eigen record
            { managerId: callerEmployee.employeeId }, // directe rapporten
          ],
        }
      } else {
        // Manager zonder employee_id: alleen eigen record (leeg resultaat)
        rbacWhere = { id: '__no_match__' }
      }
    }

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...rbacWhere,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.department && { department: query.department }),
      ...(query.status && { employmentStatus: query.status }),
    }

    const orderBy: Prisma.EmployeeOrderByWithRelationInput =
      query.sortBy === 'startDate'
        ? { startDate: query.sortDir }
        : query.sortBy === 'department'
          ? { department: query.sortDir }
          : { lastName: query.sortDir }

    const items = await tx.employee.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        department: true,
        managerId: true,
        employmentType: true,
        employmentStatus: true,
        role: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const hasMore = items.length > query.limit
    const sliced = hasMore ? items.slice(0, -1) : items
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- hasMore garandeert dat sliced ten minste één item heeft
    const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null

    return {
      items: sliced.map((e) => ({
        ...e,
        startDate: e.startDate.toISOString().slice(0, 10),
        endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      nextCursor,
    }
  })
}

export async function getEmployeeDetail(tenantId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    // Lees BSN/IBAN via pii_decrypt-functie zodat RLS + key-check op DB-niveau werkt.
    const rows = await tx.$queryRaw<Array<{
      id: string
      firstName: string
      lastName: string
      email: string
      jobTitle: string
      department: string | null
      managerId: string | null
      employmentType: string
      employmentStatus: string
      role: string
      startDate: Date
      endDate: Date | null
      phoneNumber: string | null
      bsn: string | null
      iban: string | null
      address: unknown
      createdAt: Date
      updatedAt: Date
    }>>`
      SELECT id, first_name as "firstName", last_name as "lastName", email, job_title as "jobTitle",
             department, manager_id as "managerId", employment_type as "employmentType",
             employment_status as "employmentStatus", role,
             start_date as "startDate", end_date as "endDate", phone_number as "phoneNumber",
             pii_decrypt(bsn_encrypted) as bsn,
             pii_decrypt(iban_encrypted) as iban,
             address, created_at as "createdAt", updated_at as "updatedAt"
      FROM employees
      WHERE id = ${id}::uuid AND deleted_at IS NULL
      LIMIT 1
    `

    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      jobTitle: row.jobTitle,
      department: row.department,
      managerId: row.managerId,
      employmentType: row.employmentType,
      employmentStatus: row.employmentStatus,
      role: row.role,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
      phoneNumber: row.phoneNumber,
      bsnMasked: row.bsn ? maskBsn(row.bsn) : null,
      ibanMasked: row.iban ? maskIban(row.iban) : null,
      address: (row.address as EmployeeDetailAddress) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

type EmployeeDetailAddress = {
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
} | null

export async function createEmployee(tenantId: string, userId: string, input: CreateEmployeeInput) {
  return withTenant(tenantId, async (tx) => {
    // Insert met PII via pii_encrypt-functie.
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO employees (
        id, tenant_id, first_name, last_name, email, job_title, department, manager_id,
        employment_type, employment_status, role, start_date, phone_number,
        bsn_encrypted, iban_encrypted, address
      ) VALUES (
        gen_random_uuid(), ${tenantId}::uuid, ${input.firstName}, ${input.lastName},
        ${input.email}, ${input.jobTitle}, ${input.department ?? null},
        ${input.managerId ?? null}::uuid, ${input.employmentType}::employment_type,
        'pending_start'::employment_status, ${input.role}::employee_role,
        ${input.startDate}::date, ${input.phoneNumber ?? null},
        pii_encrypt(${input.bsn ?? null}), pii_encrypt(${input.iban ?? null}),
        ${input.address ? JSON.stringify(input.address) : null}::jsonb
      )
      RETURNING id
    `

    await tx.auditEvent.create({
      data: {
        tenantId,
        userId,
        action: 'employee.create',
        entityType: 'employee',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- INSERT ... RETURNING garandeert altijd een rij; anders gooit Prisma een DB-exception
        entityId: row!.id,
        metadata: { email: input.email },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- zie boven
    return row!.id
  })
}

export async function updateEmployee(tenantId: string, userId: string, input: UpdateEmployeeInput) {
  return withTenant(tenantId, async (tx) => {
    const { id, ...rest } = input
    const data: Prisma.EmployeeUpdateInput = {}

    if (rest.firstName !== undefined) data.firstName = rest.firstName
    if (rest.lastName !== undefined) data.lastName = rest.lastName
    if (rest.email !== undefined) data.email = rest.email
    if (rest.jobTitle !== undefined) data.jobTitle = rest.jobTitle
    if (rest.department !== undefined) data.department = rest.department
    if (rest.employmentType !== undefined) data.employmentType = rest.employmentType
    if (rest.employmentStatus !== undefined) data.employmentStatus = rest.employmentStatus
    if (rest.role !== undefined) data.role = rest.role
    if (rest.startDate !== undefined) data.startDate = new Date(rest.startDate)
    if (rest.endDate !== undefined) data.endDate = rest.endDate ? new Date(rest.endDate) : null
    if (rest.phoneNumber !== undefined) data.phoneNumber = rest.phoneNumber
    if (rest.address !== undefined) data.address = rest.address as Prisma.InputJsonValue

    const updated = await tx.employee.update({ where: { id }, data })

    // PII-velden via raw SQL (pii_encrypt)
    if (rest.bsn !== undefined || rest.iban !== undefined) {
      await tx.$executeRaw`
        UPDATE employees SET
          bsn_encrypted = COALESCE(pii_encrypt(${rest.bsn ?? null}), bsn_encrypted),
          iban_encrypted = COALESCE(pii_encrypt(${rest.iban ?? null}), iban_encrypted)
        WHERE id = ${id}::uuid
      `
    }

    await tx.auditEvent.create({
      data: {
        tenantId,
        userId,
        action: 'employee.update',
        entityType: 'employee',
        entityId: id,
        metadata: { fields: Object.keys(rest) },
      },
    })

    return updated.id
  })
}

export async function revealSensitiveField(
  tenantId: string,
  userId: string,
  employeeId: string,
  field: 'bsn' | 'iban',
  reason: string,
): Promise<{ value: string; auditEventId: string }> {
  return withTenant(tenantId, async (tx) => {
    const col = field === 'bsn' ? 'bsn_encrypted' : 'iban_encrypted'
    const rows = await tx.$queryRawUnsafe<Array<{ value: string | null }>>(
      `SELECT pii_decrypt(${col}) as value FROM employees WHERE id = $1::uuid AND deleted_at IS NULL`,
      employeeId,
    )
    const value = rows[0]?.value
    if (!value) throw Object.assign(new Error('Veld niet beschikbaar'), { statusCode: 404 })

    const audit = await tx.auditEvent.create({
      data: {
        tenantId,
        userId,
        action: `employee.reveal_${field}`,
        entityType: 'employee',
        entityId: employeeId,
        metadata: { reason },
      },
    })

    return { value, auditEventId: audit.id }
  })
}

export async function softDeleteEmployee(tenantId: string, userId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } })
    await tx.auditEvent.create({
      data: {
        tenantId,
        userId,
        action: 'employee.delete',
        entityType: 'employee',
        entityId: id,
      },
    })
  })
}
