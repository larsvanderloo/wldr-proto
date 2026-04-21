import { useSessionStore } from '~/stores/session'

/**
 * useCan — lichtgewicht RBAC-helper.
 * NB: de autoritatieve check gebeurt op de backend. Dit is alleen UI-gating.
 */

type Subject = 'employee' | 'employee.pii' | 'time_off' | 'review'
type Action = 'read' | 'create' | 'update' | 'delete' | 'reveal'

const matrix: Record<Subject, Partial<Record<Action, Array<'admin' | 'manager' | 'employee'>>>> = {
  employee: {
    read: ['admin', 'manager', 'employee'],
    create: ['admin'],
    update: ['admin', 'manager'],
    delete: ['admin'],
  },
  'employee.pii': {
    reveal: ['admin'],
    read: ['admin'],
  },
  time_off: {
    read: ['admin', 'manager', 'employee'],
    create: ['admin', 'manager', 'employee'],
    update: ['admin', 'manager'],
  },
  review: {
    read: ['admin', 'manager', 'employee'],
    create: ['admin', 'manager'],
    update: ['admin', 'manager'],
  },
}

export function useCan() {
  const session = useSessionStore()
  return (action: Action, subject: Subject): boolean => {
    const role = session.role
    if (!role) return false
    const allowed = matrix[subject]?.[action] ?? []
    return allowed.includes(role)
  }
}
