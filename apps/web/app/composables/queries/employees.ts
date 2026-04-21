import { useQuery } from '@pinia/colada'
import type {
  EmployeeDetailResponse,
  EmployeeListQuery,
  EmployeeListResponse,
} from '@hr-saas/contracts/employees'

/**
 * Lijst met medewerkers. Server-side sort/filter/paginatie — de query-key
 * bevat de params, dus Colada cache per uniek filter.
 */
export function useEmployees(params: MaybeRefOrGetter<EmployeeListQuery>) {
  const api = useApi()
  return useQuery({
    key: () => ['employees', 'list', toValue(params)],
    query: () =>
      api<EmployeeListResponse>('/v1/employees', {
        query: toValue(params) as Record<string, unknown>,
      }),
    staleTime: 30_000,
  })
}

/**
 * Detail van één medewerker. Bevat gemaskeerde PII — onthullen via aparte
 * mutation, wordt audit-logged.
 */
export function useEmployee(id: MaybeRefOrGetter<string>) {
  const api = useApi()
  return useQuery({
    key: () => ['employees', 'detail', toValue(id)],
    query: () => api<EmployeeDetailResponse>(`/v1/employees/${toValue(id)}`),
    staleTime: 60_000,
    // Detail niet automatisch fetchen als id leeg is (bv nieuwe medewerker)
    enabled: () => Boolean(toValue(id)),
  })
}
