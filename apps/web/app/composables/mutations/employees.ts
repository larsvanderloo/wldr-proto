import { useMutation, useQueryCache } from '@pinia/colada'
import type {
  CreateEmployeeInput,
  RevealFieldInput,
  RevealFieldResponse,
  UpdateEmployeeInput,
} from '@hr-saas/contracts/employees'

export function useCreateEmployee() {
  const api = useApi()
  const queryCache = useQueryCache()
  const toast = useToast()
  const { t } = useI18n()

  return useMutation({
    mutation: (input: CreateEmployeeInput) =>
      api<{ id: string }>('/v1/employees', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryCache.invalidateQueries({ key: ['employees', 'list'] })
      void toast.add({ title: t('employees.created'), color: 'success' })
    },
    onError: (err) => {
      toast.add({
        title: (err as Error).message || t('errors.generic'),
        color: 'error',
      })
    },
  })
}

export function useUpdateEmployee() {
  const api = useApi()
  const queryCache = useQueryCache()
  const toast = useToast()
  const { t } = useI18n()

  return useMutation({
    mutation: (input: UpdateEmployeeInput) => {
      const { id, ...body } = input
      return api<{ id: string }>(`/v1/employees/${id}`, { method: 'PATCH', body })
    },
    onSuccess: (_data, input) => {
      void queryCache.invalidateQueries({ key: ['employees', 'list'] })
      void queryCache.invalidateQueries({ key: ['employees', 'detail', input.id] })
      void toast.add({ title: t('employees.updated'), color: 'success' })
    },
    onError: (err) => {
      toast.add({
        title: (err as Error).message || t('errors.generic'),
        color: 'error',
      })
    },
  })
}

export function useDeleteEmployee() {
  const api = useApi()
  const queryCache = useQueryCache()
  const toast = useToast()
  const { t } = useI18n()

  return useMutation({
    mutation: (id: string) => api<void>(`/v1/employees/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      void queryCache.invalidateQueries({ key: ['employees', 'list'] })
      void queryCache.invalidateQueries({ key: ['employees', 'detail', id] })
      void toast.add({ title: t('employees.deleted'), color: 'success' })
    },
  })
}

/**
 * Gevoelig veld onthullen. De backend schrijft een audit-event en geeft de
 * plain waarde terug. We cachen die NIET — toon 'm eenmalig en laat 'm weer
 * verdwijnen bij navigate.
 */
export function useRevealField(employeeId: MaybeRefOrGetter<string>) {
  const api = useApi()
  return useMutation({
    mutation: (input: RevealFieldInput) =>
      api<RevealFieldResponse>(`/v1/employees/${toValue(employeeId)}/reveal`, {
        method: 'POST',
        body: input,
      }),
  })
}
