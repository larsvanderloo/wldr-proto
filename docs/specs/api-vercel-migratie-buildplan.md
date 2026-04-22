# Build plan — Fastify → Nitro server-routes op Vercel

- **Status**: actief
- **Datum**: 2026-04-22
- **Eigenaar**: architect (dit document) → backend (uitvoering INFRA-0016/0017/0018/0019), frontend (INFRA-0020), devops-qa (INFRA-0021/0022/0023)
- **Gerelateerd**: [ADR-0007](../adr/0007-api-runtime-vercel-nitro.md), [ADR-0006](../adr/0006-auth-cookie-strategie.md) addendum 2026-04-22, [Sprint 2.5 plan](../sprints/SPRINT-02.5/plan.md)

## Doel

Eén concrete, sequentiële uitvoeringsorder voor backend zodat INFRA-0016 t/m INFRA-0019 zonder verdere architect-vragen kan starten. Het document is een werklijst — geen ADR, geen scope-discussie. Alle architecturale keuzes staan in ADR-0007 §V1-V5.

## Vooraf — invariants die backend MOET respecteren

1. **Service-laag is onveranderd**: `apps/api/src/modules/auth/{service,token,repository}.ts` en `apps/api/src/modules/employees/{service,repository}.ts` worden tijdens migratie GEKOPIEERD (niet aangeraakt-in-place). Een latere clean-up (V5: `apps/api-fastify-archive/`) verwijdert het origineel pas na 7d groene E2E. Dit garandeert rollback-pad.
2. **Contracten blijven leidend**: `@hr-saas/contracts/auth` en `@hr-saas/contracts/employees` veranderen niet. Request-/response-vorm is identiek aan Fastify-versie. Frontend hoeft alleen base-URL aan te passen (INFRA-0020) en CSRF-flow ongewijzigd.
3. **`packages/db` blijft onveranderd**: `getPrisma()`, `withTenant()`, `withoutRls()` worden hergebruikt — geen tweede Prisma-client in `apps/web/`. De singleton-via-`globalThis` pattern voor serverless wordt geïmplementeerd in `apps/web/server/utils/prisma.ts` als dunne wrapper rond `@hr-saas/db`.
4. **Geen nieuwe Zod-schemas**: alle validaties hergebruiken bestaande `*RequestSchema` / `*ResponseSchema` exports. `validateBody()`-helper wraps deze.
5. **PII-redaction is niet onderhandelbaar**: redact-paden in `server/utils/logger.ts` zijn de compliance-grens. Wijzigen vereist nieuwe ADR-revisie (zie ADR-0007 §V1).
6. **RFC 7807 error-shape blijft**: `{ type, title, status, detail?, error?, retryAfter? }`. Zie `apps/api/src/plugins/error-handler.ts` voor de huidige implementatie.

## Dependencies om toe te voegen

`apps/web/package.json` krijgt deze toevoegingen (backend voegt toe in INFRA-0018):

```json
{
  "dependencies": {
    "pino": "^9.5.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "pino-pretty": "^11.2.2",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.7"
  }
}
```

Geen extra Nitro-modules. h3 (cookies, body, query, status) zit al gebundeld via Nuxt 4. `zod-to-json-schema` is niet nodig — we gebruiken Zod-validatie inline.

## Fastify → H3 migratie-cheatsheet

Backend gebruikt deze 1-op-1-mapping. Alle helpers leven in `apps/web/server/utils/`. **Geen** route mag deze patronen overslaan; uniformiteit is de hele waarde van een centrale stack.

| Fastify-pattern | H3/Nitro-equivalent | Helper | Notitie |
|---|---|---|---|
| `app.post('/path', { schema: { body }, handler })` | `defineEventHandler(async (event) => { const body = await validateBody(event, schema); ... })` | `validateBody(event, schema)` in `validate.ts` | Throwt 400 RFC 7807 bij ZodError |
| `req.body` (typed) | `await readBody(event)` (any) → `validateBody(event, schema)` (typed) | — | NOOIT direct `readBody` zonder Zod — type-safety + validatie ineen |
| `req.query` | `getQuery(event)` → `validateQuery(event, schema)` | `validateQuery` in `validate.ts` | Casts `Record<string,string>` naar Zod-schema |
| `req.params.id` | `getRouterParam(event, 'id')` of `event.context.params?.id` | — | Filename `[id].get.ts` exposes `:id` |
| `req.headers['x-foo']` | `getHeader(event, 'x-foo')` | — | Lower-case header-name |
| `req.cookies.foo` | `getCookie(event, 'foo')` | — | h3 ingebouwd |
| `req.ip` | `getRequestIP(event, { xForwardedFor: true })` | — | Vercel zet `x-forwarded-for` automatisch |
| `req.url` | `event.path` of `getRequestURL(event)` | — | `event.path` is relatief, `getRequestURL` is absoluut |
| `reply.code(201)` | `setResponseStatus(event, 201)` of `event.node.res.statusCode = 201` | — | Default is 200 bij geretourneerde body |
| `reply.send({...})` | `return {...}` (impliciet) | — | h3 serialiseert object → JSON automatisch |
| `reply.send(null); reply.code(204)` | `setResponseStatus(event, 204); return null` | — | Vercel: lege body OK |
| `reply.setCookie(name, val, opts)` | `setCookie(event, name, val, opts)` | `setAuthCookies(event, ...)` in `cookies.ts` | Same opts-shape (httpOnly, secure, sameSite, path, maxAge) |
| `reply.clearCookie(name, opts)` | `deleteCookie(event, name, opts)` | `clearAuthCookies(event)` in `cookies.ts` | Pas op: `deleteCookie` vereist zelfde `path`/`domain` als `setCookie` |
| `request.user` (FastifyRequest decoration) | `event.context.user` | `requireUser(event)` in `auth.ts` | Throwt 401 als null |
| `req.log.info(...)` | `event.context.log.info(...)` | — | Per-request child-logger via `01.request-log.ts` |
| `setErrorHandler` | Nitro-plugin `01.error-handler.ts` + `withErrorHandling`-wrapper per handler | `withErrorHandling` in `validate.ts` (optioneel) | h3 vangt thrown errors op |
| `throw createError(...)` | `throw createError({ statusCode, statusMessage, data })` | — | h3-API; `data` wordt response-body |
| Throw met `statusCode` property | Idem, h3 respecteert `error.statusCode` | — | Service-laag werkt 1-op-1 |
| `app.config.public = true` | Path-check in `02.auth-context.ts` middleware | — | Hardcoded `PUBLIC_PATHS`-set, geen per-route config |

## Sequencing — concrete uitvoeringsorder

Backend werkt in **vier fasen**. Elke fase eindigt op een commit en draait `scripts/ci-local.sh` succesvol vóór de volgende fase begint. Geen feature-flag of staging-branche; main is leidend (gewone PR-flow).

### Fase 0 — fundering (INFRA-0018, deel 1: utilities + plugins)

**Doel**: alle gedeelde infrastructuur staat vóór de eerste route gemigreerd wordt. Geen route-werk in deze fase.

**Bestanden** (in deze volgorde aanmaken):

1. `apps/web/package.json` — voeg deps toe (pino, bcryptjs, jsonwebtoken + types/devDeps).
2. `apps/web/server/utils/prisma.ts` — wrapper rond `@hr-saas/db` met serverless-singleton:
   ```ts
   import { getPrisma, withTenant, withoutRls } from '@hr-saas/db'
   // Re-export — singleton zit al in @hr-saas/db. Vercel function-instances
   // hergebruiken globalThis tussen invocations binnen dezelfde lambda.
   export { getPrisma, withTenant, withoutRls }
   ```
   Belangrijk: GEEN tweede `new PrismaClient()` aanmaken. Connection-pooling gebeurt op Neon-niveau via pooled URL (ADR-0005).
3. `apps/web/server/utils/validate.ts` — Zod-validatie helpers:
   ```ts
   // validateBody(event, schema): readBody → schema.parse → typed body
   // validateQuery(event, schema): getQuery → schema.parse → typed query
   // Beide throwen createError({ statusCode: 400, data: zodIssuesToProblem(err) })
   // zodat 01.error-handler.ts uniformly logt + serialiseert.
   // withErrorHandling(handler): wrapper die service-thrown errors (statusCode + authCode)
   //   omzet naar createError-equivalent. Optioneel maar aanbevolen voor
   //   uniforme RFC 7807 output.
   ```
4. `apps/web/server/utils/auth.ts` — auth-helpers (gebruikers van `event.context.user`):
   ```ts
   // requireUser(event): throwt 401 als event.context.user === null
   // requireRole(event, ...roles): throwt 403 als rol niet matcht
   // Gebruikt door employees-routes; auth-routes zijn publiek (geen requireUser).
   ```
5. `apps/web/server/utils/cookies.ts` — refresh + CSRF cookies (zonder `Domain`, conform ADR-0006 addendum):
   ```ts
   // setAuthCookies(event, refreshToken, csrfToken)
   //   - hr_refresh: httpOnly, Secure(prod), SameSite=Lax, Path=/api/v1/auth, MaxAge=7d
   //   - hr_csrf:    !httpOnly, Secure(prod), SameSite=Lax, Path=/api/v1/auth, MaxAge=7d
   //   - GEEN Domain-attribuut (same-origin, ADR-0006 addendum)
   // clearAuthCookies(event): deleteCookie voor beide met zelfde Path
   // Constants: REFRESH_COOKIE='hr_refresh', CSRF_COOKIE='hr_csrf', COOKIE_PATH='/api/v1/auth'
   ```
6. `apps/web/server/utils/auth-token.ts` — kopie van `apps/api/src/modules/auth/token.ts`. Geen wijziging behalve import-paden. Gebruik `node:crypto` + `jsonwebtoken`.
7. `apps/web/server/plugins/00.logger.ts` — bind `logger` aan `nitroApp`:
   ```ts
   import { logger } from '../utils/logger'
   export default defineNitroPlugin((nitroApp) => {
     nitroApp.hooks.hook('request', (event) => {
       // Geen werk hier — 01.request-log.ts middleware doet de child-logger.
       // Deze plugin bestaat alleen om logger te initialiseren bij Nitro-boot
       // (top-level pino-instance is dan al warm).
     })
   })
   ```
   Effectief is deze plugin een no-op behalve het importeren van de logger-module — dat triggert de top-level `pino()`-call. Mag eventueel weggelaten worden als import-volgorde gegarandeerd is via middleware. **Backend mag deze plugin overslaan** als hij in een commentaar in `01.request-log.ts` documenteert dat de logger-import daar de eerste touch is.
8. `apps/web/server/plugins/01.error-handler.ts` — Nitro-error-hook + global RFC 7807 fallback:
   ```ts
   export default defineNitroPlugin((nitroApp) => {
     nitroApp.hooks.hook('error', async (err, { event }) => {
       // 1. Log met PII-redaction (event.context.log of fallback logger)
       // 2. Als err.statusCode bestaat: respecteer + behoud err.data als body
       // 3. Anders: 500 + generic "Interne fout"
       // 4. Zorg dat response NOOIT stack-trace of PII bevat
     })
   })
   ```
   Belangrijk: h3's eigen errorHandler werkt náást deze hook. De plugin is voor logging + observability; de wrapper `withErrorHandling` (utils/validate.ts) doet de body-shape per handler. Backend kiest één path consistent — aanbevolen: `withErrorHandling` per route + plugin alleen voor logging.
9. `apps/web/server/middleware/00.request-id.ts` — request-ID + response-header:
   ```ts
   export default defineEventHandler((event) => {
     const incoming = getHeader(event, 'x-request-id')
     const requestId = incoming ?? crypto.randomUUID()
     event.context.requestId = requestId
     setResponseHeader(event, 'x-request-id', requestId)
   })
   ```
10. `apps/web/server/middleware/00.security-headers.ts` — `Cache-Control: no-store` op `/api/*`:
    ```ts
    export default defineEventHandler((event) => {
      if (event.path.startsWith('/api/')) {
        setResponseHeader(event, 'Cache-Control', 'no-store')
      }
    })
    ```
11. `apps/web/server/middleware/01.request-log.ts` — child-logger op `event.context.log`:
    ```ts
    import { requestLogger } from '../utils/logger'
    export default defineEventHandler((event) => {
      event.context.log = requestLogger({
        requestId: event.context.requestId ?? 'unknown',
        method: event.method,
        url: event.path,
      })
    })
    ```
    De `userId`/`tenantId`-velden worden in `02.auth-context.ts` toegevoegd via `event.context.log = event.context.log.child({ userId, tenantId })`.
12. `apps/web/server/middleware/02.auth-context.ts` — JWT-validatie + `event.context.user`:
    ```ts
    // 1. Skip publieke paden:
    //    /api/v1/healthz, /api/v1/auth/login, /api/v1/auth/refresh, /api/v1/auth/logout
    // 2. Lees Authorization: Bearer
    // 3. verifyAccessToken → event.context.user = { id, tenantId, role }
    // 4. Bij TokenExpiredError → 401 error: 'token_expired' (RFC 7807)
    // 5. Bij JsonWebTokenError → 401 error: 'unauthorized'
    // 6. Bij missing header op beveiligde route → 401 error: 'unauthorized'
    // 7. Verrijk log: event.context.log = event.context.log.child({ userId, tenantId })
    ```
    **Geen aparte `tenant-context` middleware** — `event.context.user.tenantId` is direct beschikbaar. De Sprint-2 shim (`apps/api/src/plugins/tenant-context.ts`) was alleen voor backward-compat; in Nitro kunnen services direct uit `event.context.user` lezen.
13. `apps/web/server/api/v1/healthz.get.ts` — minimale health-check zodat smoke-test in CI groen blijft tijdens de migratie:
    ```ts
    export default defineEventHandler(() => ({ status: 'ok' }))
    ```
    Pad in `deploy-demo.yml` smoke-test is al `/api/v1/healthz`.

**Acceptatie fase 0**:
- `pnpm --filter=@hr-saas/web build` slaagt.
- `curl http://localhost:3000/api/v1/healthz` retourneert `{"status":"ok"}` lokaal.
- Logger-instance produceert JSON met `service: 'hr-saas-web'` en geen PII bij test-call (handmatig: `curl -H "Authorization: Bearer foo"` mag geen `foo` in logs hebben).
- Middleware draait in juiste volgorde — voeg een tijdelijke `console.log` in elk file en check.

**Commit**: `chore(web): voeg Nitro-fundering toe (utilities, plugins, middleware) [INFRA-0018]`

### Fase 1 — rate-limiter (INFRA-0019)

**Doel**: Postgres-backed rate-limit beschikbaar als `enforceRateLimit(event, key, opts)`-helper. Dit is een aparte fase omdat het een DB-migratie vereist.

**Stappen** (in deze volgorde):

1. `packages/db/prisma/schema.prisma` — voeg `RateLimitBucket`-model toe (definitie in ADR-0007 §V2). Update `Tenant`-model NIET (bewust geen `tenant_id`, zie ADR-rationale).
2. `packages/db/prisma/migrations/20260423000000_add_rate_limit_buckets/migration.sql`:
   ```sql
   CREATE TABLE rate_limit_buckets (
     bucket_key  TEXT PRIMARY KEY,
     count       INTEGER NOT NULL DEFAULT 0,
     reset_at    TIMESTAMPTZ NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX rate_limit_buckets_reset_at_idx ON rate_limit_buckets(reset_at);
   -- Geen RLS: zie schema-comment + ADR-0007 §V2.
   -- Geen audit-trigger: rate-limit-events zijn geen security-relevante audit-data.
   ```
3. `apps/web/server/utils/rate-limit.ts` — implementeer `enforceRateLimit(event, key, { maxAttempts, windowMs })`:
   - Gebruikt `withoutRls()` uit `@hr-saas/db` (rate-limit is pre-tenant-resolve).
   - Algoritme: atomic UPSERT zoals in ADR-0007 §V2 (Postgres-syntax met `ON CONFLICT DO UPDATE`).
   - Geeft `{ blocked: boolean, retryAfterSeconds?: number }` terug — identieke shape als de Fastify-versie.
   - Bij `blocked: true` zet de helper een `Retry-After`-response-header en throwt `createError({ statusCode: 429, data: { ... } })`.
   - Eenvoud: geen periodieke cleanup-cron. UPSERT herinitialiseert verlopen rijen automatisch (lazy cleanup).
4. **GEEN** `apps/web/server/api/v1/_internal/rate-limit-cleanup.post.ts` voor Sprint 2.5. Vercel Cron komt als follow-up als de tabel boven 100k rijen groeit.

**Migratie-volgorde**:
- DB-migratie draait via bestaande `migrate`-job in `deploy-demo.yml` — geen pipeline-wijziging nodig.
- Backend MOET eerst de migratie pushen (lokaal: `pnpm --filter=@hr-saas/db migrate:dev`), pas daarna de `rate-limit.ts`-helper introduceren. Anders breekt CI tijdens een tussenliggende build.

**Acceptatie fase 1**:
- Migratie draait succesvol op lokale dev-DB.
- `enforceRateLimit(event, 'test:user@example.com', { maxAttempts: 3, windowMs: 300_000 })` blokkeert na 3 calls.
- Vitest-test in `apps/web/server/utils/__tests__/rate-limit.test.ts` simuleert 4 opeenvolgende UPSERTS met test-DB en verifieert het 4e antwoord = `blocked: true` met `retryAfterSeconds > 0`.
- `_resetAllBuckets` wordt vervangen door `await prisma.$executeRaw\`DELETE FROM rate_limit_buckets\`` in de test-helper.

**Commit**: `feat(db,web): voeg postgres-backed rate-limiter toe [INFRA-0019]`

### Fase 2 — auth-endpoints (INFRA-0016)

**Doel**: alle vier auth-routes draaien op Nitro met identieke gedrag als de Fastify-versie. Frontend kan tegen `/api/v1/auth/*` aanroepen zodra deze fase live is.

**Bestanden** (in deze volgorde):

1. `apps/web/server/services/auth/` — kopie van `apps/api/src/modules/auth/{service,token,repository}.ts`. **Eén wijziging**: `service.ts` neemt geen `FastifyRequest` meer aan; in plaats daarvan een `AuthContext`-object:
   ```ts
   export interface AuthContext {
     ip: string
     log: Logger
     user: { id: string; tenantId: string; role: UserRole } | null
   }
   ```
   Alle service-functies hertekend: `register(ctx, input)`, `login(ctx, input)`, etc. Routes bouwen `ctx` op uit `event` voor de service-call.

   Reden voor deze refactor: `FastifyRequest` is een Fastify-type. Direct overnemen zou een verborgen Fastify-dep in `apps/web/` introduceren. `AuthContext` is generiek en testbaar.

   **Compliance**: de service-laag-logica (RBAC-checks, anti-timing, rate-limit-call, dummy-bcrypt) MAG NIET aangepast worden. Alleen de signature-shape wijzigt.

2. `apps/web/server/services/auth/rate-limit.ts` — vervangt de in-memory variant:
   - Importeer `enforceRateLimit` uit `server/utils/rate-limit.ts` (Postgres-backed).
   - Behoud de `bucketKey()`-functie (`<ip>:<lowercase_email>`).
   - Verwijder de in-memory `Map`, `cleanupTimer`, `_resetAllBuckets`. Tests gebruiken DB-truncate.
   - Behoud de exports `recordFailedAttempt(ip, email)`, `isRateLimited(ip, email)`, `clearRateLimit(ip, email)` (zelfde signatures, async-versies). Service-laag (auth/service.ts) verandert niet, alleen `await`-keywords toegevoegd.

3. `apps/web/server/api/v1/auth/login.post.ts`:
   ```ts
   export default defineEventHandler(async (event) => {
     const body = await validateBody(event, loginRequestSchema)
     const ctx = buildAuthContext(event)  // helper in utils/auth.ts
     const tokens = await login(ctx, body)
     const csrfToken = generateRefreshToken()
     setAuthCookies(event, tokens.refreshToken, csrfToken)
     return {
       access_token: tokens.accessToken,
       expires_in: tokens.expiresIn,
       token_type: 'Bearer' as const,
     }
   })
   ```
4. `apps/web/server/api/v1/auth/refresh.post.ts`:
   - CSRF double-submit check: `getCookie(event, CSRF_COOKIE) === getHeader(event, 'x-csrf-token')`.
   - Refresh-cookie lezen, `findTenantIdForRefreshToken` aanroepen (gekopieerde helper).
   - `service.refresh(ctx, { refreshToken, tenantId })`.
   - Roteer cookies (nieuw refresh + nieuw csrf).
5. `apps/web/server/api/v1/auth/logout.post.ts`:
   - Best-effort revoke (zelfde flow als Fastify-versie).
   - `clearAuthCookies(event)`, `setResponseStatus(event, 204)`, `return null`.
6. `apps/web/server/api/v1/auth/register.post.ts`:
   - `requireUser(event)` + `requireRole(event, 'hr_admin')` (helpers uit `utils/auth.ts`).
   - `service.register(ctx, body)`.
   - `setResponseStatus(event, 201)`.

**Tests** (Vitest, `apps/web/server/api/v1/auth/__tests__/`):
- Hergebruik test-patroon uit `apps/api/src/modules/auth/__tests__/auth.integration.test.ts`. Test-helper `app-factory.ts` wordt vervangen door `nuxt-test-utils` (`@nuxt/test-utils/e2e`) of door directe `defineEventHandler`-aanroep met mock-event uit `h3` (lichter, sneller).
- **Aanbeveling**: per route één integration-test die de echte handler aanroept met een mock-event en de echte test-DB raakt. E2E (Playwright) dekt de end-to-end browser-flow.

**Volgorde van implementatie**:
1. `utils/auth.ts` — helpers `buildAuthContext(event)`, `requireUser(event)`, `requireRole(event, ...roles)`.
2. `services/auth/` — kopie + signature-refactor.
3. `api/v1/auth/login.post.ts` — eerste route, validate end-to-end met curl-script.
4. `api/v1/auth/refresh.post.ts` — meest complex (CSRF + cross-tenant lookup).
5. `api/v1/auth/logout.post.ts` — eenvoud.
6. `api/v1/auth/register.post.ts` — vereist auth-context middleware werkend.

**Acceptatie fase 2**:
- Alle vier routes geven identieke response-bodies + cookies als de Fastify-versie (snapshot-test op een `curl`-output).
- Login → refresh → logout flow werkt lokaal in `nuxt dev`.
- Rate-limit blokkeert na 3 mislukte logins (DB heeft een rij in `rate_limit_buckets`).
- CSRF-mismatch op `/refresh` → 401 `csrf_mismatch`.
- Vitest auth-tests groen.

**Commit**: `feat(web): migreer auth-endpoints naar Nitro server-routes [INFRA-0016]`

### Fase 3 — employee-endpoints (INFRA-0017)

**Doel**: alle CRUD + reveal endpoints draaien op Nitro. Vereist dat `02.auth-context.ts` middleware werkt (klaar in fase 0).

**Bestanden** (in deze volgorde):

1. `apps/web/server/services/employees/` — kopie van `apps/api/src/modules/employees/{service,repository}.ts`. Service-signature: `EmployeesContext` (zelfde shape als `AuthContext`, hergebruiken indien praktisch).
2. `apps/web/server/api/v1/employees/index.get.ts` — `GET /api/v1/employees`:
   ```ts
   export default defineEventHandler(async (event) => {
     requireUser(event)
     const query = await validateQuery(event, employeeListQuerySchema)
     const ctx = buildEmployeesContext(event)
     return service.list(ctx, query)
   })
   ```
3. `apps/web/server/api/v1/employees/index.post.ts` — `POST /api/v1/employees` (hr_admin only — service checkt).
4. `apps/web/server/api/v1/employees/[id].get.ts` — `GET /api/v1/employees/:id`. Param via `getRouterParam(event, 'id')`. Validate met `uuidSchema.parse(id)`. Null-response → `setResponseStatus(event, 404)` + `return null`.
5. `apps/web/server/api/v1/employees/[id].patch.ts` — `PATCH /api/v1/employees/:id`. Body via `validateBody(event, updateEmployeeInputSchema.omit({ id: true }))`.
6. `apps/web/server/api/v1/employees/[id].delete.ts` — `DELETE /api/v1/employees/:id`. `setResponseStatus(event, 204); return null`.
7. `apps/web/server/api/v1/employees/[id]/reveal.post.ts` — `POST /api/v1/employees/:id/reveal`. Service-laag schrijft audit-event (al in DB-trigger).

**Acceptatie fase 3**:
- Lijst, detail, create, update, delete, reveal werken end-to-end met geldig JWT.
- 401 zonder JWT, 403 als verkeerde rol, 404 als andere tenant.
- Vitest employee-tests groen (kopie/aanpassing van `apps/api/src/modules/employees/__tests__/` indien aanwezig — anders nieuwe minimale set).

**Commit**: `feat(web): migreer employee-endpoints naar Nitro server-routes [INFRA-0017]`

## Parallellisme-graaf

```
Fase 0 (utilities + middleware) ─┬─ Fase 1 (rate-limiter)
                                 │
                                 └─ kan parallel met Fase 1 maar Fase 2 vereist beide

Fase 1 ─┐
        ├─→ Fase 2 (auth-endpoints)
Fase 0 ─┘

Fase 2 ─→ Fase 3 (employee-endpoints, vereist auth-middleware live + getest)
```

Backend MAG fase 0 en 1 parallel oppakken (verschillende bestanden). Fase 2 wacht op beide. Fase 3 wacht op fase 2 (auth-middleware moet bewezen werken).

## Frontend (INFRA-0020) — geen blocker, parallel aan backend

`apps/web/app/composables/useApi.ts` heeft al `baseURL: '/api/v1'` en `credentials: 'include'`. Frontend taken:

1. Verwijder `runtimeConfig.public.apiBase` uit `nuxt.config.ts` (regels 29-35).
2. Verwijder `NUXT_PUBLIC_API_BASE` uit `.env.example` en uit alle env-doc-files.
3. Update `apps/web/playwright.config.ts` als die `E2E_API_BASE_URL` gebruikt (devops-qa doet dit in INFRA-0023).
4. Verwijder eventuele CORS-plugin in `apps/web/` (er zou er geen moeten zijn — verifiëren).

Frontend kan dit pushen voordat backend fase 2 af heeft, mits de healthz-route uit fase 0 al live staat. De auth-routes zijn dan nog 404 maar dat is alleen relevant in E2E (devops-qa wacht op fase 2).

## DevOps-QA (INFRA-0021/0022/0023)

INFRA-0021 (CI/CD Fly.io verwijderen) is al grotendeels gedaan — `deploy-demo.yml` laat zien dat de Fly-jobs vervangen zijn door `vercel-env-sync` + `deploy-web`. Restpunten:

1. **`apps/api/`-uitsluiting in CI**: `.github/workflows/ci.yml` (devops-qa controleren). Filter `--filter='!@hr-saas/api'` op lint/typecheck/test. Tests in `apps/api/src/modules/auth/__tests__/` en `apps/api/src/modules/employees/__tests__/` worden niet gedraaid; backend hergebruikt de logica in `apps/web/server/services/`.
2. **README in `apps/api/`** toevoegen met DEPRECATED-banner (zie ADR-0007 §V5 stap 4).
3. **DNS-cleanup `api.larsvdloo.com`** wacht op groene E2E (INFRA-0022 — P1).
4. **Playwright-config** updaten om `E2E_API_BASE_URL` te verwijderen, alleen `E2E_BASE_URL` te gebruiken (INFRA-0023). Tests moeten relatieve `/api/v1/...`-paden gebruiken via de pagina-context.
5. **Sprint 3 dag 1**: rename `apps/api/` → `apps/api-fastify-archive/` na 7d groene E2E (architect-actie, niet sprint 2.5 scope).

## Risico's en mitigaties tijdens uitvoering

| Risico | Waarschijnlijkheid | Impact | Mitigatie |
|---|---|---|---|
| Prisma-singleton lekt connections op Vercel cold start | Laag | Middel | `globalThis._prisma`-pattern in `@hr-saas/db` is al cold-start safe. Monitor Neon-dashboard 1ste 24h na deploy. |
| Pino bundlesize > Vercel function-budget (50 MB unzipped) | Laag | Hoog | Pino is ~150 KB. Met Prisma client (~7 MB) en Nitro runtime zit de hele function ver onder 50 MB. Geen actie. |
| `setCookie` in Nitro retourneert geen `Domain` waar we hem niet willen — maar leest hij correct bij `deleteCookie`? | Middel | Middel | Test expliciet: login → logout binnen één sessie. `deleteCookie(event, 'hr_refresh', { path: '/api/v1/auth' })` moet zonder `domain`-arg de cookie verwijderen. h3-source bevestigd: zelfde path = match. |
| Vercel's `x-forwarded-for` levert proxy-IP i.p.v. client-IP, rate-limiter blokkeert verkeerde keys | Laag | Hoog (lock-out hele kantoor) | Gebruik `getRequestIP(event, { xForwardedFor: true })` — Vercel geeft de client-IP correct in de eerste positie. Test in preview-deploy met curl vanaf 2 IPs. |
| Audit-trigger schrijft `app.user_id`-setting niet meer als de service een andere tx-helper gebruikt | Middel | Hoog (compliance) | `withTenant()` blijft de enige write-path; service-code is letterlijk gekopieerd inclusief `SET LOCAL app.user_id`. Vitest-test verifieert audit-event-rij na een create-call. |
| Service-refactor (`FastifyRequest` → `AuthContext`) introduceert subtiele bugs | Middel | Middel | Diff-review per file: nieuwe en oude implementatie naast elkaar. Eenheidstest per service-functie met mock-context. |
| Frontend `useApi` retry-logic werkt niet meer omdat refresh-cookie path `/api/v1/auth` niet matcht het `/api/v1/employees`-call-path | Hoog | Hoog | Cookies worden door browser meegestuurd onafhankelijk van origin-call-path bij `credentials: 'include'`. Refresh-cookie op `Path=/api/v1/auth` betekent: alleen calls naar `/api/v1/auth/*` ontvangen het. `useApi.refresh()` POST naar `/api/v1/auth/refresh` — match. Verifiëren in browser-devtools. |

## Definition of done — totaal

1. ADR-0007 status `accepted` met alle 5 vragen beantwoord — **klaar**.
2. Build plan in `docs/specs/api-vercel-migratie-buildplan.md` — **dit document**.
3. ADR-0006 addendum cookie-scope same-origin — **klaar** (zie ADR-0006 §Addendum 2026-04-22).
4. Geen code-wijzigingen door architect — **klaar** (alleen docs + skelet-folders + logger-stub aangemaakt eerder).
5. Husky pre-push groen voor de docs-commit.
6. Backend kan met dit document INFRA-0016/0017/0018/0019 uitvoeren zonder verdere architect-vragen.
