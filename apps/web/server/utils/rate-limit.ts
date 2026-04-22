/**
 * Postgres-backed rate-limiter voor auth-endpoints.
 *
 * Vervangt de in-memory rate-limiter uit apps/api/ — die werkt niet op serverless
 * (elke function-invocation is een apart process). Postgres is de gedeelde state.
 *
 * Algoritme: atomic UPSERT met CASE-expressie — race-safe.
 * Zie ADR-0007 §V2 voor het volledige ontwerp.
 *
 * Cleanup: lazy via UPSERT (verlopen rijen worden geherinitaliseerd).
 * Periodieke harde DELETE via Vercel Cron volgt als follow-up (Sprint 3+).
 */

import { createError, type H3Event, setResponseHeader } from 'h3'
import { getPrisma } from './prisma.js'

const WINDOW_MS = 5 * 60 * 1000 // 5 minuten
const MAX_ATTEMPTS = 3

function bucketKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`
}

interface RateLimitResult {
  blocked: boolean
  retryAfterSeconds?: number
  count: number
}

/**
 * Controleert of een key geblokkeerd is en registreert een nieuwe poging
 * in één atomic UPSERT.
 *
 * @param key       - Compositie-key, bv "<ip>:<email>". Gebruik `bucketKey()`.
 * @param windowMs  - Tijdvenster in milliseconden.
 * @param maxAttempts - Max pogingen binnen het venster.
 */
async function checkAndRecord(
  key: string,
  windowMs: number,
  maxAttempts: number,
): Promise<RateLimitResult> {
  const prisma = getPrisma()
  const windowSecs = windowMs / 1000

  // Atomic UPSERT — race-safe.
  // CASE: als reset_at verstreken → start nieuw window (count=1).
  //       anders → count+1, reset_at ongewijzigd.
  const rows = await prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>`
    INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
    VALUES (${key}, 1, now() + (${windowSecs} || ' seconds')::interval)
    ON CONFLICT (bucket_key) DO UPDATE
      SET count     = CASE WHEN rate_limit_buckets.reset_at < now()
                           THEN 1
                           ELSE rate_limit_buckets.count + 1 END,
          reset_at  = CASE WHEN rate_limit_buckets.reset_at < now()
                           THEN now() + (${windowSecs} || ' seconds')::interval
                           ELSE rate_limit_buckets.reset_at END,
          updated_at = now()
    RETURNING count, reset_at
  `

  const row = rows[0]
  if (!row) {
    // Onverwacht — UPSERT retourneert altijd een rij
    return { blocked: false, count: 0 }
  }

  const count = Number(row.count)
  const blocked = count > maxAttempts

  if (blocked) {
    const retryAfterMs = row.reset_at.getTime() - Date.now()
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
    return { blocked: true, retryAfterSeconds, count }
  }

  return { blocked: false, count }
}

/**
 * Controleer de rate-limit vóór een auth-poging (read-only check via UPSERT
 * met count+0 via separate SELECT — hier doen we check + record in één stap).
 *
 * @returns `{ blocked: true, retryAfterSeconds }` als geblokkeerd.
 */
export async function isRateLimited(
  ip: string,
  email: string,
  opts?: { windowMs?: number; maxAttempts?: number },
): Promise<{ blocked: boolean; retryAfterSeconds?: number }> {
  const windowMs = opts?.windowMs ?? WINDOW_MS
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS
  const key = bucketKey(ip, email)

  const prisma = getPrisma()
  const row = await prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>`
    SELECT count, reset_at
    FROM rate_limit_buckets
    WHERE bucket_key = ${key}
      AND reset_at > now()
  `

  if (!row[0]) return { blocked: false }

  const count = Number(row[0].count)
  if (count >= maxAttempts) {
    const retryAfterMs = row[0].reset_at.getTime() - Date.now()
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
    return { blocked: true, retryAfterSeconds }
  }

  void windowMs // param beschikbaar voor toekomstige multi-window logica
  return { blocked: false }
}

/**
 * Registreer een mislukte poging en check of de limiet nu overschreden is.
 * Atomic UPSERT — veilig bij gelijktijdige requests.
 */
export async function recordFailedAttempt(
  ip: string,
  email: string,
  opts?: { windowMs?: number; maxAttempts?: number },
): Promise<{ blocked: boolean; retryAfterSeconds?: number }> {
  const windowMs = opts?.windowMs ?? WINDOW_MS
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS
  const key = bucketKey(ip, email)
  return checkAndRecord(key, windowMs, maxAttempts)
}

/**
 * Reset de teller bij succesvolle login.
 * Soft-reset: verwijder de rij zodat het volgende window opnieuw begint.
 */
export async function clearRateLimit(ip: string, email: string): Promise<void> {
  const key = bucketKey(ip, email)
  const prisma = getPrisma()
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE bucket_key = ${key}`
}

/**
 * `enforceRateLimit` — gecombineerde check + record + http-response helper.
 *
 * Wordt direct aangeroepen door login-route vóór bcrypt-werk.
 * Zet `Retry-After`-header en throwt 429 als geblokkeerd.
 */
export async function enforceRateLimit(
  event: H3Event,
  key: string,
  opts?: { maxAttempts?: number; windowMs?: number },
): Promise<void> {
  const windowMs = opts?.windowMs ?? WINDOW_MS
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS

  const result = await checkAndRecord(key, windowMs, maxAttempts)

  if (result.blocked) {
    const retryAfter = result.retryAfterSeconds ?? 60
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      statusMessage: 'Te veel pogingen',
      data: {
        type: 'https://hr-saas.example/problems/error',
        title: 'Te veel pogingen',
        status: 429,
        error: 'rate_limited',
        detail: `Probeer opnieuw over ${retryAfter} seconden`,
        retryAfter: retryAfter,
      },
    })
  }
}

/** Testhelper — verwijder alle bucket-rijen in de test-DB. */
export async function _resetAllBuckets(): Promise<void> {
  const prisma = getPrisma()
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets`
}
