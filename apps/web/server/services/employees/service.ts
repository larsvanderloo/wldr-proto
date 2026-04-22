/**
 * Employees service — Nitro-versie.
 *
 * Geport van `apps/api/src/modules/employees/service.ts`.
 * `FastifyRequest` vervangen door `AuthenticatedContext`.
 *
 * RBAC-regels (AUTH-0005):
 *   - hr_admin: volledige toegang
 *   - manager: eigen record + directe rapporten
 *   - employee: alleen eigen record
 */

import type { AuthenticatedContext } from '../../types/auth-context.js'
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from '@hr-saas/contracts/employees'
import * as repo from './repository.js'

function forbidden(): never {
  throw Object.assign(new Error('Niet geautoriseerd voor deze actie'), { statusCode: 403, authCode: 'forbidden' })
}

export async function list(ctx: AuthenticatedContext, query: EmployeeListQuery) {
  const { user } = ctx

  let employeeIdFilter: string | undefined
  let managerIdFilter: string | undefined

  if (user.role === 'employee') {
    employeeIdFilter = user.id
  } else if (user.role === 'manager') {
    managerIdFilter = user.id
  }

  return repo.listEmployees(user.tenantId, query, { employeeIdFilter, managerIdFilter, callerUserId: user.id })
}

export async function detail(ctx: AuthenticatedContext, id: string) {
  const { user } = ctx
  const employeeDetail = await repo.getEmployeeDetail(user.tenantId, id)
  if (!employeeDetail) return null

  if (user.role === 'hr_admin') return employeeDetail

  if (user.role === 'manager') {
    if (employeeDetail.managerId === user.id || isOwnRecord(employeeDetail.id, user.id)) {
      return employeeDetail
    }
    return null
  }

  if (user.role === 'employee') {
    if (isOwnRecord(employeeDetail.id, user.id)) return employeeDetail
    return null
  }

  return null
}

function isOwnRecord(employeeId: string, userId: string): boolean {
  void employeeId
  void userId
  return false
}

export async function create(ctx: AuthenticatedContext, input: CreateEmployeeInput) {
  const { user } = ctx
  if (user.role !== 'hr_admin') forbidden()
  return repo.createEmployee(user.tenantId, user.id, input)
}

export async function update(ctx: AuthenticatedContext, input: UpdateEmployeeInput) {
  const { user } = ctx

  if (user.role === 'hr_admin') {
    return repo.updateEmployee(user.tenantId, user.id, input)
  }

  if (user.role === 'manager') {
    if (input.role !== undefined || input.employmentStatus !== undefined) forbidden()
    const existing = await repo.getEmployeeDetail(user.tenantId, input.id)
    if (!existing || existing.managerId !== user.id) forbidden()
    return repo.updateEmployee(user.tenantId, user.id, input)
  }

  // employee: zelf-edit is voorlopig niet ondersteund (Sprint 3+)
  forbidden()
}

export async function reveal(
  ctx: AuthenticatedContext,
  id: string,
  field: 'bsn' | 'iban',
  reason: string,
) {
  const { user } = ctx
  if (user.role !== 'hr_admin') forbidden()
  return repo.revealSensitiveField(user.tenantId, user.id, id, field, reason)
}

export async function remove(ctx: AuthenticatedContext, id: string) {
  const { user } = ctx
  if (user.role !== 'hr_admin') forbidden()
  return repo.softDeleteEmployee(user.tenantId, user.id, id)
}
