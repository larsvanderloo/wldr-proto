import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'
import type { JwtClaims, LoginRequest, User } from '@hr-saas/contracts/auth'

/**
 * Auth-store (Pinia, NIET gepersisteerd).
 *
 * - access_token leeft uitsluitend in memory (Pinia state) — nooit in
 *   localStorage of sessionStorage (ADR-0006 § 1).
 * - refresh_token is een httpOnly-cookie die de browser automatisch meestuurt
 *   op /v1/auth/* — de frontend ziet hem niet.
 * - CSRF double-submit: hr_csrf-cookie (niet-httpOnly) wordt bij refresh
 *   meegestuurd als X-CSRF-Token header.
 *
 * Testbaarheid: apiBase is via setAuthApiBase() overschrijfbaar zodat tests
 * geen Nuxt-app-instantie nodig hebben.
 */

let _apiBase: string | null = null
let _getCsrfToken: () => string | undefined = () => {
  // useCookie is een Nuxt-composable — werkt in Nuxt-context
  try {
    return useCookie('hr_csrf').value ?? undefined
  }
  catch {
    return undefined
  }
}

/** Intern gebruik: geeft de geconfigureerde API base URL. */
function getApiBase(): string {
  if (_apiBase !== null) return _apiBase
  return (useRuntimeConfig().public.apiBase as string)
}

function getCsrfToken(): string | undefined {
  return _getCsrfToken()
}

/**
 * Injecteer een statische apiBase — alleen voor tests.
 * Roep aan vóór de store wordt aangemaakt.
 */
export function setAuthApiBase(url: string): void {
  _apiBase = url
}

/**
 * Injecteer een CSRF-token getter — alleen voor tests.
 * In productie leest de store automatisch de hr_csrf cookie via useCookie.
 */
export function setAuthCsrfGetter(getter: () => string | undefined): void {
  _getCsrfToken = getter
}

function decodeUser(token: string): User {
  const claims = jwtDecode<JwtClaims>(token)
  return {
    id: claims.sub,
    email: '',          // email zit niet in claims; wordt overschreven na login
    role: claims.role,
    tenantId: claims.tenantId,
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    accessToken: null as string | null,
    expiresAt: null as number | null,
    /** Geeft aan of restore() al een poging heeft gedaan — voorkomt herhaling. */
    _restored: false,
  }),

  getters: {
    isAuthenticated: (s): boolean => s.user !== null && s.accessToken !== null,
  },

  actions: {
    /**
     * Inloggen met e-mail + wachtwoord. Stelt accessToken en user in.
     * De backend zet hr_refresh + hr_csrf als Set-Cookie.
     */
    async login(credentials: LoginRequest): Promise<void> {
      const data = await $fetch<{ access_token: string; expires_in: number; token_type: 'Bearer' }>(
        `${getApiBase()}/v1/auth/login`,
        {
          method: 'POST',
          body: credentials,
          credentials: 'include',
        },
      )
      this._setToken(data.access_token, data.expires_in)
      // email uit loginform opslaan zodat de UI hem kan tonen
      if (this.user) {
        this.user = { ...this.user, email: credentials.email }
      }
    },

    /**
     * Stille refresh — wordt aangeroepen bij app-start (F4 middleware) en
     * transparant bij 401 token_expired (F2 useApi interceptor).
     * Geeft `true` bij succes, `false` als de cookie ontbreekt/verlopen is.
     */
    async refresh(): Promise<boolean> {
      try {
        const csrfToken = getCsrfToken()
        const data = await $fetch<{ access_token: string; expires_in: number; token_type: 'Bearer' }>(
          `${getApiBase()}/v1/auth/refresh`,
          {
            method: 'POST',
            credentials: 'include',
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
          },
        )
        this._setToken(data.access_token, data.expires_in)
        return true
      }
      catch {
        this._clear()
        return false
      }
    },

    /**
     * Uitloggen — revoked refresh-token op de server, wist lokale state.
     */
    async logout(): Promise<void> {
      try {
        const csrfToken = getCsrfToken()
        await $fetch(`${getApiBase()}/v1/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        })
      }
      catch {
        // Altijd de lokale state wissen, ook bij netwerk-fout
      }
      this._clear()
    },

    /**
     * Wordt aangeroepen op SSR-init (auth.global middleware).
     * Probeert refresh; als dat slaagt is de user ingelogd.
     * Markeert _restored zodat de middleware dit niet opnieuw doet.
     */
    async restore(): Promise<boolean> {
      if (this._restored) return this.isAuthenticated
      this._restored = true
      return await this.refresh()
    },

    _setToken(token: string, expiresIn: number): void {
      this.accessToken = token
      this.expiresAt = Date.now() + expiresIn * 1000
      try {
        const user = decodeUser(token)
        // behoud eventueel email dat we al hadden
        this.user = { ...user, email: this.user?.email ?? '' }
      }
      catch {
        this._clear()
        throw new Error('Ongeldig access-token ontvangen')
      }
    },

    _clear(): void {
      this.user = null
      this.accessToken = null
      this.expiresAt = null
    },
  },
})
