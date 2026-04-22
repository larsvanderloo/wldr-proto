# Build-plan: Authenticatie (FEAT-0002)

> Begeleidend bij [`docs/specs/authenticatie.md`](authenticatie.md) en [ADR-0006](../adr/0006-auth-cookie-strategie.md).
> Concrete taken voor `backend`, `frontend`, `devops-qa` na architect-deliverables (ADR + contracten + migratie).

## Sequencing — globaal

```
Dag 1 (klaar):           architect — ADR + Zod-contracts + Prisma-schema + migratie
Dag 2:                   backend — migrate run + AUTH-0001 (register) + AUTH-0002 (login)
                         frontend — start AUTH-0006 tegen contract (mock-API)
Dag 3:                   backend — AUTH-0003 (refresh) + AUTH-0004 (auth-context plugin)
                         frontend — AUTH-0006 happy-path tegen echte staging-API
Dag 4:                   backend — AUTH-0005 (RBAC) + AUTH-0008 (employees beveiligen)
                         frontend — AUTH-0007 (route-middleware + auto-refresh interceptor)
Dag 5:                   mid-sprint check (pm + architect)
Dag 6-8:                 devops-qa — AUTH-0009 (Playwright E2E) + Fly secrets + smoke-tests
Dag 9-10:                review + retro + release
```

## Backend (`apps/api/`)

Volgorde is verplicht. Elke taak commit afzonderlijk; tests vóór commit groen.

### B1 — Migratie draaien + Prisma client regenereren (AUTH-0001 voorbereiding)

- `pnpm --filter=@hr-saas/db prisma migrate dev` (lokaal — Neon-shadow voor CI handelt automatisch).
- `pnpm --filter=@hr-saas/db generate` voor de nieuwe `User` / `RefreshToken` types.
- Verifieer in `psql`: `\d users`, `\d refresh_tokens`, `SELECT polrelid::regclass FROM pg_policy WHERE polrelid IN ('users'::regclass, 'refresh_tokens'::regclass);` — beide moeten een `tenant_isolation_*` policy hebben.

### B2 — `seed.ts` met test-tenant + 3 users (AUTH-0001 sluitstuk + AUTH-0009 dependency)

- `packages/db/prisma/seed.ts`: maakt `acme` tenant met `email_domain = 'acme.test'`, drie users (hr_admin / manager / employee), bcrypt-hashed wachtwoord `Welkom01!Welkom`. Voor elke `manager` en `employee` ook een gekoppelde `Employee`-rij.
- Idempotent (upsert op `(tenant_id, email)`).
- Run via `pnpm --filter=@hr-saas/db prisma db seed`.

### B3 — `POST /v1/auth/register` (AUTH-0001)

- Handler validates met `registerRequestSchema` (Auth-namespace).
- Service: bcrypt hash (rounds 12, `bcrypt` of `bcryptjs`), insert in transaction met `SET LOCAL app.tenant_id`. Bij role `employee` of `manager`: vereist `employeeId` in payload (anders 422).
- Response: `registerResponseSchema` (geen passwordHash).
- Errors: 409 `email_already_taken` (unique-constraint catch), 422 `password_too_weak` (Zod-fail), 422 algemeen voor ontbrekende `employeeId` waar nodig.

### B4 — `POST /v1/auth/login` (AUTH-0002)

- Validates met `loginRequestSchema`.
- Resolve tenant: split email op `@`, lookup `tenants.email_domain` → tenant_id. Als ontbreekt: gebruik `tenantSlug` uit body. Beide ontbreken/falen → 401 `invalid_credentials` (constant-time response, dummy bcrypt-compare om timing-leak te voorkomen).
- `SET LOCAL app.tenant_id` → SELECT user → bcrypt.compare → genereer JWT (15 min) + opaque refresh (32 random bytes hex) → INSERT `refresh_tokens` met sha256-hash.
- Response: `loginResponseSchema` (access_token, expires_in 900, token_type 'Bearer'). Set-Cookie `hr_refresh` (httpOnly, Secure, SameSite=Lax, Path=/v1/auth, Domain conform NODE_ENV) + `hr_csrf` (zelfde scope, geen httpOnly).
- Rate-limit: in-memory token-bucket per `(ip, email)`, 3 fouten / 5 min → 429 `rate_limited` met `retryAfter` in body.

### B5 — `POST /v1/auth/refresh` (AUTH-0003)

- Geen body. CSRF-check: `cookies.hr_csrf === headers['x-csrf-token']`, anders 401 `csrf_mismatch`.
- sha256(plaintext cookie) → SELECT `refresh_tokens` WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now(). Als niets: 401 `refresh_revoked`.
- In transactie: UPDATE oude rij `revoked_at = now()`, INSERT nieuwe rij, lookup user voor JWT-claims, geef nieuwe access-token + nieuwe `hr_refresh`/`hr_csrf` cookies.

### B6 — `POST /v1/auth/logout`

- Revoke refresh-token (`UPDATE ... SET revoked_at = now()`), clear beide cookies (`Max-Age=0`).
- 204 No Content.

### B7 — `auth-context` Fastify-plugin (AUTH-0004)

- Plugin parst `Authorization: Bearer <jwt>`, valideert HS256 met `JWT_SECRET`, decodeert claims volgens `jwtClaimsSchema`.
- Op success: `request.user = { id, tenantId, role }` + `SET LOCAL app.tenant_id` + `SET LOCAL app.user_id` op de transactie-PG-client.
- Op missing/invalid token op publieke routes: passeer (route opt-in via `routeOptions.config.public = true`).
- Op private routes: 401 `unauthorized` of 401 `token_expired` afhankelijk van JWT-error.
- Performance-budget: < 5ms p95 (jwt-decode is sync). Meet via `request.diagnosticsChannel` of Fastify hook-timings.

### B8 — RBAC-laag (AUTH-0005)

- Service-helper `requireRole(allowedRoles: Role[])` die `request.user.role` checkt. 403 `forbidden` bij mismatch.
- `GET /v1/employees`: filter aan service-niveau gebaseerd op rol:
  - `hr_admin`: geen extra filter (RLS scopet al op tenant).
  - `manager`: WHERE `manager_id = request.user.employeeId OR id = request.user.employeeId`.
  - `employee`: WHERE `id = request.user.employeeId`. Lege `employeeId` → 403 `forbidden` (mag niet voorkomen na AUTH-0001 service-validatie).

### B9 — Bestaande employee-endpoints beveiligen (AUTH-0008)

- Verwijder de Sprint-1 `x-tenant-id` / `x-user-id`-header-fallback uit `apps/api/src/plugins/`.
- Alle `/v1/employees/*` routes opt-in op `auth-context` (default private).
- Smoke-test: zonder JWT → 401.

### B10 — Tests

- Unit (Vitest): bcrypt-helper, JWT-issuer, refresh-token-rotatie-logica.
- Integration (Vitest + testcontainers Postgres): full register → login → refresh → logout flow + RLS-isolatie cross-tenant probe.
- Per AUTH-* story: minimaal happy-path + onhappy-path test (de Gherkin-criteria uit de spec).

## Frontend (`apps/web/`)

Kan parallel beginnen zodra `@hr-saas/contracts` met `auth/` namespace gepubliceerd is in workspace.

### F1 — Auth-store (Pinia, niet gepersisteerd) (AUTH-0006)

- `apps/web/app/stores/auth.ts` met state `{ user: User | null; accessToken: string | null; expiresAt: number | null }`.
- Actions: `login(email, password, tenantSlug?)`, `refresh()`, `logout()`, `restore()` (probeer refresh op SSR-init).
- `user` is afgeleid uit JWT-decode (geen aparte `/me` call nodig in MVP — claims zijn voldoende).
- Niét via `pinia-plugin-persistedstate` — access-token leeft in memory, refresh komt uit httpOnly-cookie.

### F2 — `useApi` composable uitbreiden

- Bestaande `useApi` zet `Authorization: Bearer ${authStore.accessToken}` automatisch.
- 401 `token_expired` interceptor: probeer `authStore.refresh()`, retry de oorspronkelijke call éénmaal. Bij tweede 401: redirect /login.
- CSRF-header `X-CSRF-Token` lezen uit `hr_csrf`-cookie via `useCookie('hr_csrf')` op `/auth/refresh`.

### F3 — `/login` pagina (AUTH-0006)

- `apps/web/app/pages/login.vue` met `UForm` + `loginRequestSchema` als zod-validator.
- Velden: email, password. `tenantSlug`-veld pas tonen na een mislukte login (`error === 'invalid_credentials'`).
- Submit → `authStore.login()` → bij success redirect naar `route.query.redirect ?? '/'`. Bij error: i18n-toast.
- a11y: `<UFormGroup>` levert label-koppeling; aria-live region voor server-foutmelding.

### F4 — Auth-guard middleware (AUTH-0007)

- `apps/web/app/middleware/auth.global.ts`:
  - Op SSR: probeer `authStore.restore()` (POST /v1/auth/refresh; cookie gaat automatisch mee).
  - Als geen user na restore: redirect naar `/login?redirect=${to.fullPath}` tenzij route `meta.public = true`.
  - Op `/login` met aanwezige user: redirect naar `/`.

### F5 — i18n-keys

- `apps/web/i18n/locales/nl-NL.json` + `en-US.json` aanvullen met `auth.*` keys (login title, error-meldingen per `AuthErrorCode`, logout-confirmatie).

### F6 — Rolgates UI (AUTH-0005 frontend-zijde)

- `useCan('employees:read')` enz. uitbreiden om `authStore.user.role` te lezen (vervangt huidige x-header-fake).
- `<Can permission="employees:write">` blijft puur cosmetic; auth-check is server-side.

### F7 — Tests

- Vitest component-tests voor `<LoginForm>` (validation + submit-handler).
- Mock-API met `vi.mocked(useApi)` voor login/refresh.

## DevOps + QA (`infra/`, `.github/workflows/`, runbooks)

### D1 — Fly secrets

- `JWT_SECRET` (random 64 bytes hex), `BCRYPT_PEPPER` (optioneel, niet vereist Sprint 2).
- `flyctl secrets set JWT_SECRET=... -a wldr-proto-api`.
- Runbook entry in `docs/runbooks/secrets-management.md`.

### D2 — `email_domain` setten op staging-tenant

- Via `prisma db execute` of seed. Documenteren in onboarding-runbook: bij elke nieuwe tenant moet `email_domain` gezet worden vóór login werkt.

### D3 — Playwright E2E (AUTH-0009)

- `apps/web/e2e/auth.spec.ts`:
  - Happy-path: login als `hr_admin@acme.test` → ziet employee-lijst → logout.
  - Unhappy: fout wachtwoord → blijft op /login + foutmelding zichtbaar.
  - Refresh: manipuleer `expires_at` van JWT (decode → re-encode met past-exp; alleen mogelijk als JWT_SECRET in test-fixture beschikbaar is — alternatief: mock klok in API met env-toggle).
- Run in `deploy-demo.yml` na deploy van staging.

### D4 — Smoke-test in deploy-pipeline

- Voor elke `/v1/employees/*` route: ongeauthenticeerde request → 401 (regressie-vangst voor AUTH-0008).
- Tenant-isolatie probe: gebruiker van tenant-A request employee van tenant-B → 404 (RLS, niet 403).

### D5 — RLS-CI-check (uit ADR-0002 vervolgactie, herinnering)

- Script in `scripts/check-rls.sh` of als CI-step: parse alle `CREATE TABLE` statements in migraties, eis dat elke nieuwe tabel óf RLS heeft óf in een explicit allow-list staat. AUTH-0001 toegevoegd in deze sprint = perfect moment.

## Sequencing-noten

- **Backend B3..B6 mogen pas na B1+B2** (migratie + seed).
- **Frontend F1..F4 kunnen parallel aan backend** zolang de Zod-contracten gepubliceerd zijn (architect-deliverable, klaar). F3 kan tegen mock; F4 vereist een werkend `/v1/auth/refresh` op staging.
- **AUTH-0008 (B9) blokkeert pas op AUTH-0004 (B7)**: zonder auth-context is er niets om te beveiligen.
- **AUTH-0005 (B8) en AUTH-0007 (F4) hebben coördinatie nodig**: rol-claim moet in JWT zitten (B4 geregeld) en in `useCan` (F6 leest claim).
- **D3 blokkeert op staging-deploy van backend + frontend**, dus pas dag 6+.

## Definition of done — uit FEAT-0002 spec

Onveranderd; deze build-out moet alle DoD-items afvinken vóór release.
