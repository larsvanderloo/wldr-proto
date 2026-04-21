import type { PiniaColadaOptions } from '@pinia/colada'

/**
 * Globale defaults voor alle queries.
 * Override alleen per-call wanneer je een goede reden hebt en zet er een
 * commentaar bij waarom.
 */
export default {
  queryOptions: {
    staleTime: 30_000,      // 30s — goed voor lijsten die we vaak refreshen
    gcTime: 5 * 60_000,     // 5 min cache na laatste subscriber
    retry: (failureCount, error) => {
      // Geen retry op client-errors (4xx) — die lossen zichzelf niet op.
      const status = (error as { statusCode?: number })?.statusCode
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  },
} satisfies PiniaColadaOptions
