/**
 * Auth-helpers voor Nitro route-handlers.
 *
 * `requireUser` en `requireRole` worden door beveiligde routes gebruikt
 * om te garanderen dat `event.context.user` aanwezig is en de juiste rol heeft.
 *
 * De auth-context (`event.context.user`) is gezet door `02.auth-context.ts`.
 */

import { type H3Event, createError, getRequestIP, getHeader } from 'h3'
import type { UserRole } from '../types/auth-context.js'
import type { Logger } from 'pino'

/**
 * Geeft de geverifieerde gebruiker terug.
 * Throwt 401 als er geen geauthenticeerde context is.
 */
export function requireUser(event: H3Event): {
  id: string
  tenantId: string
  role: UserRole
} {
  const user = event.context.user
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Niet geauthenticeerd',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Niet geauthenticeerd',
        status: 401,
        error: 'unauthorized',
      },
    })
  }
  return user
}

/**
 * Controleert of de ingelogde gebruiker een van de opgegeven rollen heeft.
 * Throwt 403 als de rol niet matcht.
 */
export function requireRole(event: H3Event, ...roles: UserRole[]): {
  id: string
  tenantId: string
  role: UserRole
} {
  const user = requireUser(event)
  if (!roles.includes(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Niet geautoriseerd voor deze actie',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Niet geautoriseerd voor deze actie',
        status: 403,
        error: 'forbidden',
      },
    })
  }
  return user
}

/**
 * Bouwt een `AuthContext` op vanuit het H3-event.
 * Gebruikt door auth- en employee-service-functies.
 */
export function buildAuthContext(event: H3Event): {
  ip: string
  log: Logger
  user: { id: string; tenantId: string; role: UserRole } | null
} {
  return {
    ip: getRequestIP(event, { xForwardedFor: true }) ?? '127.0.0.1',
    log: event.context.log,
    user: event.context.user ?? null,
  }
}

/**
 * Bouwt een context op voor de employee-service.
 * Vereist een geauthenticeerde gebruiker.
 */
export function buildEmployeesContext(event: H3Event): {
  ip: string
  log: Logger
  user: { id: string; tenantId: string; role: UserRole }
} {
  const user = requireUser(event)
  return {
    ip: getRequestIP(event, { xForwardedFor: true }) ?? '127.0.0.1',
    log: event.context.log,
    user,
  }
}

/**
 * Leest de tenant-ID uit de auth-context van het event.
 * Vereist dat `event.context.user` aanwezig is.
 */
export function getTenantId(event: H3Event): string {
  return requireUser(event).tenantId
}

/**
 * Leest de CSRF-token uit de request-header.
 */
export function getCsrfHeader(event: H3Event): string | undefined {
  return getHeader(event, 'x-csrf-token')
}
