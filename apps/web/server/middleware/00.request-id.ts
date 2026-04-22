/**
 * Request-ID middleware — loopt als eerste in de keten.
 *
 * Leest `x-request-id` header als die er is (load-balancer / upstream gezet),
 * anders: genereer UUID4. Slaat op in `event.context.requestId` en zet de
 * header ook terug in de response voor correlatie door upstream services.
 */

import { defineEventHandler, getHeader, setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const incoming = getHeader(event, 'x-request-id')
  const requestId = incoming ?? crypto.randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)
})
