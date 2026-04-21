import { defineStore } from 'pinia'

/**
 * Sessie-store — alleen identiteit en rol. Server-data gaat NIET hier, die
 * gaat via Pinia Colada composables. Deze store wordt gehydrateerd door de
 * auth.global middleware op basis van een server-call naar /v1/me.
 */

export type SessionUser = {
  id: string
  tenantId: string
  role: 'admin' | 'manager' | 'employee'
  email: string
  firstName: string
  lastName: string
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: null as SessionUser | null,
  }),
  getters: {
    isAuthenticated: (s) => s.user !== null,
    role: (s) => s.user?.role ?? null,
  },
  actions: {
    set(user: SessionUser) {
      this.user = user
    },
    clear() {
      this.user = null
    },
  },
})
