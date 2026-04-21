import type { FastifyRequest } from 'fastify'
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from '@hr-saas/contracts/employees'
import * as repo from './repository.js'

/**
 * Service-laag voor employees.
 * - Autorisatie gebeurt HIER, nooit alleen in de controller of UI.
 * - Business rules die niet in Zod te vatten zijn (bv "manager moet in dezelfde
 *   tenant zitten") wonen ook hier.
 */

function forbidden(): never {
  throw Object.assign(new Error('Niet geautoriseerd voor deze actie'), { statusCode: 403 })
}

export async function list(req: FastifyRequest, query: EmployeeListQuery) {
  // Elke geauthenticeerde user mag de lijst zien (zonder PII).
  return repo.listEmployees(req.tenantId, query)
}

export async function detail(req: FastifyRequest, id: string) {
  // Employees mogen alleen zichzelf zien in detail. Managers hun reports.
  // Admins iedereen. Voor de seed checken we alleen admin/manager/self.
  const detail = await repo.getEmployeeDetail(req.tenantId, id)
  if (!detail) return null

  if (req.userRole === 'admin') return detail
  if (req.userRole === 'manager' && detail.managerId === req.userId) return detail
  if (req.userId === id) return detail
  forbidden()
}

export async function create(req: FastifyRequest, input: CreateEmployeeInput) {
  if (req.userRole !== 'admin') forbidden()
  return repo.createEmployee(req.tenantId, req.userId, input)
}

export async function update(req: FastifyRequest, input: UpdateEmployeeInput) {
  if (req.userRole === 'employee' && req.userId !== input.id) forbidden()
  if (req.userRole === 'manager') {
    // Manager mag eigen reports updaten, maar niet role/employmentStatus wijzigen.
    if (input.role !== undefined || input.employmentStatus !== undefined) forbidden()
    const existing = await repo.getEmployeeDetail(req.tenantId, input.id)
    if (!existing || existing.managerId !== req.userId) forbidden()
  }
  return repo.updateEmployee(req.tenantId, req.userId, input)
}

export async function reveal(
  req: FastifyRequest,
  id: string,
  field: 'bsn' | 'iban',
  reason: string,
) {
  // Alleen admins mogen onthullen. Audit log wordt geschreven in de repository.
  if (req.userRole !== 'admin') forbidden()
  return repo.revealSensitiveField(req.tenantId, req.userId, id, field, reason)
}

export async function remove(req: FastifyRequest, id: string) {
  if (req.userRole !== 'admin') forbidden()
  return repo.softDeleteEmployee(req.tenantId, req.userId, id)
}
