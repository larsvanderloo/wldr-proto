/**
 * In-memory rate-limiter voor auth-endpoints.
 *
 * Token-bucket per (ip, email): max 3 fouten per 5 minuten.
 * Bij horizontale schaling: vervangen door Redis-backed variant (FEAT-followup).
 *
 * Zie spec FEAT-0002 NFR + ADR-0006 § "Rate-limiting".
 */

const WINDOW_MS = 5 * 60 * 1000 // 5 minuten
const MAX_ATTEMPTS = 3

interface BucketEntry {
  count: number
  resetAt: number
}

const buckets = new Map<string, BucketEntry>()

// Ruim verlopen buckets op om memory-leaks te voorkomen.
// Draait max elke 10 min — geen overhead bij lage traffic.
let cleanupTimer: ReturnType<typeof setInterval> | undefined

function ensureCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(
    () => {
      const now = Date.now()
      for (const [key, entry] of buckets.entries()) {
        if (entry.resetAt < now) buckets.delete(key)
      }
    },
    10 * 60 * 1000,
  )
  // Laat de timer de event loop niet blokkeren bij process-exit.
  if (cleanupTimer.unref) cleanupTimer.unref()
}

function bucketKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`
}

/**
 * Registreer een mislukte poging.
 * Geeft `{ blocked: true, retryAfterSeconds }` terug als rate-limit overschreden.
 * Geeft `{ blocked: false }` terug als er nog ruimte is.
 */
export function recordFailedAttempt(
  ip: string,
  email: string,
): { blocked: boolean; retryAfterSeconds?: number } {
  ensureCleanup()
  const key = bucketKey(ip, email)
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || entry.resetAt < now) {
    // Nieuw window
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { blocked: false }
  }

  entry.count += 1

  if (entry.count > MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { blocked: true, retryAfterSeconds }
  }

  return { blocked: false }
}

/**
 * Controleer of een (ip, email) combinatie al geblokkeerd is.
 * Roep dit aan VÓÓR enig DB-werk om timing-aanvallen te beperken.
 */
export function isRateLimited(ip: string, email: string): { blocked: boolean; retryAfterSeconds?: number } {
  const key = bucketKey(ip, email)
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || entry.resetAt < now) return { blocked: false }
  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { blocked: true, retryAfterSeconds }
  }
  return { blocked: false }
}

/**
 * Reset de teller bij succesvolle login (optioneel — voorkomt lock-out door timing).
 */
export function clearRateLimit(ip: string, email: string): void {
  buckets.delete(bucketKey(ip, email))
}

// Testbaar: expose voor teardown in tests
export function _resetAllBuckets(): void {
  buckets.clear()
}
