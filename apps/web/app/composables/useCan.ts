import type { Role } from '@hr-saas/contracts/auth'

/**
 * useCan — lichtgewicht RBAC-helper.
 *
 * Leest de rol van de ingelogde gebruiker uit de auth-store (AUTH-0006/F6).
 * Rollen komen uit de JWT-claims: 'hr_admin' | 'manager' | 'employee'.
 *
 * NB: de autoritatieve check gebeurt op de backend. Dit is uitsluitend UI-gating.
 */

type Subject = 'employee' | 'employee.pii' | 'time_off' | 'review'
type Action = 'read' | 'create' | 'update' | 'delete' | 'reveal'

const matrix: Record<Subject, Partial<Record<Action, Role[]>>> = {
  employee: {
    read: ['hr_admin', 'manager', 'employee'],
    create: ['hr_admin'],
    update: ['hr_admin', 'manager'],
    delete: ['hr_admin'],
  },
  'employee.pii': {
    reveal: ['hr_admin'],
    read: ['hr_admin'],
  },
  time_off: {
    read: ['hr_admin', 'manager', 'employee'],
    create: ['hr_admin', 'manager', 'employee'],
    update: ['hr_admin', 'manager'],
  },
  review: {
    read: ['hr_admin', 'manager', 'employee'],
    create: ['hr_admin', 'manager'],
    update: ['hr_admin', 'manager'],
  },
}

export function useCan() {
  const authStore = useAuthStore()
  return (action: Action, subject: Subject): boolean => {
    const role = authStore.user?.role
    if (!role) return false
    const allowed = matrix[subject]?.[action] ?? []
    return allowed.includes(role)
  }
}
