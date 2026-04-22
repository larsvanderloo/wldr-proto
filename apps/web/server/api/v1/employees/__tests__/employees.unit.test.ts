/**
 * Unit-tests voor employee-service (zonder DB).
 * Dekt: RBAC-checks, tenant-scoping logica.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/employees/repository.js', () => ({
  listEmployees: vi.fn(),
  getEmployeeDetail: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  revealSensitiveField: vi.fn(),
  softDeleteEmployee: vi.fn(),
}))

import type { AuthenticatedContext } from '../../../../types/auth-context.js'

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}

function makeCtx(role: 'hr_admin' | 'manager' | 'employee' = 'hr_admin'): AuthenticatedContext {
  return {
    ip: '127.0.0.1',
    log: mockLog as unknown as AuthenticatedContext['log'],
    user: { id: 'user-001', tenantId: 'tenant-001', role },
  }
}

describe('employee-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('gooit 403 als de gebruiker geen hr_admin is', async () => {
      const { create } = await import('../../../../services/employees/service.js')
      const ctx = makeCtx('employee')

      await expect(
        create(ctx, {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@acme.nl',
          jobTitle: 'Dev',
          employmentType: 'permanent',
          role: 'employee',
          startDate: '2026-01-01',
        }),
      ).rejects.toMatchObject({ statusCode: 403, authCode: 'forbidden' })
    })

    it('roept de repository aan voor hr_admin', async () => {
      const { create } = await import('../../../../services/employees/service.js')
      const repo = await import('../../../../services/employees/repository.js')

      vi.mocked(repo.createEmployee).mockResolvedValue('new-employee-id')

      const ctx = makeCtx('hr_admin')
      const input = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@acme.nl',
        jobTitle: 'Dev',
        employmentType: 'permanent' as const,
        role: 'employee' as const,
        startDate: '2026-01-01',
      }

      const id = await create(ctx, input)
      expect(id).toBe('new-employee-id')
      expect(repo.createEmployee).toHaveBeenCalledWith('tenant-001', 'user-001', input)
    })
  })

  describe('remove', () => {
    it('gooit 403 als de gebruiker geen hr_admin is', async () => {
      const { remove } = await import('../../../../services/employees/service.js')

      await expect(remove(makeCtx('manager'), 'emp-id')).rejects.toMatchObject({
        statusCode: 403,
        authCode: 'forbidden',
      })
    })
  })

  describe('reveal', () => {
    it('gooit 403 als de gebruiker geen hr_admin is', async () => {
      const { reveal } = await import('../../../../services/employees/service.js')

      await expect(
        reveal(makeCtx('employee'), 'emp-id', 'bsn', 'test reden'),
      ).rejects.toMatchObject({ statusCode: 403, authCode: 'forbidden' })
    })
  })

  describe('update', () => {
    it('gooit 403 als employee de rol wil wijzigen', async () => {
      const { update } = await import('../../../../services/employees/service.js')

      await expect(
        update(makeCtx('employee'), { id: 'emp-id', role: 'admin' }),
      ).rejects.toMatchObject({ statusCode: 403, authCode: 'forbidden' })
    })

    it('gooit 403 als manager de rol wil wijzigen', async () => {
      const { update } = await import('../../../../services/employees/service.js')

      await expect(
        update(makeCtx('manager'), { id: 'emp-id', role: 'admin' }),
      ).rejects.toMatchObject({ statusCode: 403, authCode: 'forbidden' })
    })
  })
})
