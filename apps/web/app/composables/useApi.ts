/**
 * Gedeelde API-fetcher. Zet baseURL uit runtimeConfig en geeft cookies mee.
 * Server-state gebruikt altijd DIT, nooit fetch/useFetch direct.
 */
export function useApi() {
  const config = useRuntimeConfig()
  return $fetch.create({
    baseURL: config.public.apiBase,
    credentials: 'include',
    // onResponseError zet errors om in een vorm die Colada begrijpt;
    // status-code blijft beschikbaar voor retry-beslissing.
    onResponseError({ response }) {
      const err = new Error(response._data?.title ?? 'API-fout') as Error & {
        statusCode?: number
        problem?: unknown
      }
      err.statusCode = response.status
      err.problem = response._data
      throw err
    },
  })
}
