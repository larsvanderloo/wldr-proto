# Sprint 02 — Plan

- **Periode**: 2026-04-22 t/m 2026-05-05
- **Scrum-master / facilitator**: pm
- **Status**: in-progress

## Sprintdoel

Een HR-admin en medewerker kunnen inloggen met email/wachtwoord, zijn aan hun tenant gebonden, en kunnen de applicatie demoen zonder nep-headers in productie.

## Capaciteit

| Agent | Beschikbaarheid | Noten |
|---|---|---|
| pm | 100% | Spec + backlog-onderhoud |
| architect | 90% | ADR auth-strategie + JWT-schema + RLS-uitbreiding; geen lopende ADR's meer uit Sprint 1 |
| backend | 100% | Auth-endpoints + sessie-middleware + tenant-scope |
| frontend | 100% | Login-flow + sessie-store + rol-gates |
| devops-qa | 80% | Fly secrets-beheer, E2E auth-flows |

## Stories in deze sprint

| ID | Titel | Priority | Routing | Inschatting | Status |
|---|---|---|---|---|---|
| AUTH-0001 | Tenant-aware gebruikersregistratie + wachtwoord-hash | P0 | architect (schema) → backend | M | ready |
| AUTH-0002 | Login endpoint: email/wachtwoord → JWT-sessie | P0 | architect (contract) → backend | M | ready |
| AUTH-0003 | Refresh-token flow + token-rotatie | P0 | backend | S | ready |
| AUTH-0004 | Sessie-middleware: JWT valideren + tenant/user in request-context | P0 | backend | S | ready |
| AUTH-0005 | Rol-model: hr_admin / manager / employee — basis RBAC | P0 | architect (schema + contract) → backend | M | ready |
| AUTH-0006 | Frontend login-pagina + sessie-store (Pinia) | P0 | frontend | M | ready |
| AUTH-0007 | Auth-guard middleware Nuxt + automatische redirect na login | P0 | frontend | S | ready |
| AUTH-0008 | Bestaande employee-endpoints beveiligen (verwijder x-headers) | P0 | backend + frontend | S | ready |
| AUTH-0009 | E2E login happy-path + unhappy-path (Playwright) | P0 | devops-qa | S | ready |

**Aanname**: SAML/SSO (originele scope FEAT-0002) is bewust uit Sprint 2 gelaten. SAML veronderstelt een enterprise IdP-deal die nog niet bestaat. SSO wordt FEAT-0002b, opgepakt zodra klant-0 een IdP-vereiste stelt. Basis email/password is voldoende voor demo en fundeert de autorisatie-laag voor onboarding + verlof in Sprint 3.

## Story-details

### AUTH-0001 — Tenant-aware gebruikersregistratie + wachtwoord-hash
**Businesswaarde**: Zonder gebruikersrecords in de juiste tenant is inloggen niet mogelijk; dit is de data-fundering van auth.
**Inschatting**: M | **Priority**: P0

Acceptatiecriteria:
- **Given** architect ADR is gemerged, **when** backend het schema uitrolt, **then** bestaat tabel `users` met kolommen `id`, `tenant_id`, `email` (uniek per tenant), `password_hash` (bcrypt, rounds 12), `role`, `created_at`, `updated_at`; RLS-policy scopet op `tenant_id`; audit_events-trigger aanwezig voor INSERT/UPDATE/DELETE
- **Given** een POST /auth/register met een geldig e-mailadres en wachtwoord (min. 12 tekens), **when** de request binnenkomt, **then** retourneert de API 201 met `{ id, email, role }` — geen password_hash in response — en staat er een record in `users`
- **Given** hetzelfde e-mailadres binnen dezelfde tenant wordt nogmaals geregistreerd, **when** POST /auth/register, **then** retourneert 409 Conflict
- **Given** een wachtwoord korter dan 12 tekens, **when** POST /auth/register, **then** retourneert 422 Unprocessable Entity met Zod-foutmelding

### AUTH-0002 — Login endpoint: email/wachtwoord → JWT-sessie
**Businesswaarde**: De zichtbare demomoment — een gebruiker logt in en ziet de applicatie.
**Inschatting**: M | **Priority**: P0

Acceptatiecriteria:
- **Given** een POST /auth/login met correct e-mailadres + wachtwoord, **when** de API valideert, **then** retourneert 200 met `{ access_token (JWT, 15 min), refresh_token (opaque, 7 dagen) }` — tenant_id en role als JWT-claims
- **Given** een onjuist wachtwoord, **when** POST /auth/login, **then** retourneert 401 met generieke melding (geen onderscheid e-mail/wachtwoord)
- **Given** een account van tenant A, **when** request bevat tenant-context van tenant B (via host header), **then** retourneert 401
- **Given** drie opeenvolgende mislukte inlogpogingen binnen 5 minuten, **when** vierde poging, **then** retourneert 429 Too Many Requests (rate-limit in-memory; Redis-optie als follow-up)

### AUTH-0003 — Refresh-token flow + token-rotatie
**Businesswaarde**: Zorgt dat een ingelogde sessie niet na 15 minuten afloopt zonder dat de gebruiker dat merkt.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** een geldig refresh_token, **when** POST /auth/refresh, **then** retourneert een nieuw access_token + nieuw refresh_token (rotatie); het oude refresh_token is ongeldig
- **Given** een gebruikt of verlopen refresh_token, **when** POST /auth/refresh, **then** retourneert 401
- **Given** token-rotatie, **when** refresh_tokens tabel, **then** is de maximale TTL 7 dagen en wordt een verlopen token opgeruimd bij de volgende refresh-call (geen afzonderlijke cleanup-job vereist in Sprint 2)

### AUTH-0004 — Sessie-middleware: JWT valideren + tenant/user in request-context
**Businesswaarde**: Alle bestaande en nieuwe endpoints zijn automatisch beveiligd zonder herhaalde code.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** een request met een geldig JWT in de Authorization-header (`Bearer <token>`), **when** de middleware draait, **then** is `request.user = { id, tenantId, role }` beschikbaar voor alle route-handlers
- **Given** een ontbrekende of ongeldige Authorization-header op een beveiligde route, **when** de request binnenkomt, **then** retourneert 401
- **Given** een verlopen JWT, **when** de request binnenkomt, **then** retourneert 401 met `{ error: "token_expired" }` — zodat de frontend refresh kan initiëren
- **Given** een publieke route (`/healthz`, `/auth/login`, `/auth/register`, `/auth/refresh`), **when** de request binnenkomt zonder token, **then** passeert de middleware zonder fout

### AUTH-0005 — Rol-model: hr_admin / manager / employee — basis RBAC
**Businesswaarde**: Zonder rollen kan een medewerker elkaars data zien; dit is een blocker voor veilige demo en compliance.
**Inschatting**: M | **Priority**: P0

Acceptatiecriteria:
- **Given** een ingelogde gebruiker met rol `employee`, **when** GET /employees (lijstview), **then** retourneert alleen het eigen record (403 op andermans records)
- **Given** een ingelogde gebruiker met rol `hr_admin`, **when** GET /employees, **then** retourneert alle medewerkers van de eigen tenant
- **Given** een ingelogde gebruiker met rol `manager`, **when** GET /employees, **then** retourneert directe rapporten + eigen record (aanname: manager_id-kolom bestaat op employees; Sprint 3 verfijnt dit met organogram)
- **Given** een poging om een employee-record van een andere tenant op te vragen, **when** GET /employees/:id, **then** retourneert 404 (tenant-isolatie via RLS, niet via 403)

### AUTH-0006 — Frontend login-pagina + sessie-store (Pinia)
**Businesswaarde**: De gebruiker kan daadwerkelijk inloggen via de browser.
**Inschatting**: M | **Priority**: P0

Acceptatiecriteria:
- **Given** een niet-ingelogde gebruiker die de app opent, **when** de pagina laadt, **then** wordt /login getoond met e-mail + wachtwoord veld en een "Inloggen"-knop
- **Given** correcte credentials, **when** de gebruiker op "Inloggen" klikt, **then** wordt de gebruiker naar de homepagina geredirect en is `useAuthStore().user` gevuld
- **Given** foutieve credentials, **when** de gebruiker op "Inloggen" klikt, **then** toont de UI een foutbericht zonder de pagina te herladen; wachtwoordveld wordt geleegd
- **Given** een ingelogde gebruiker die de browser herstart, **when** de app laadt, **then** wordt de sessie hersteld via het refresh-token (httpOnly cookie-strategie — zie openstaande vragen)
- **Given** de sessie-store, **when** een component `useCan('employees:write')` aanroept, **then** retourneert de composable correct op basis van de opgeslagen rol

### AUTH-0007 — Auth-guard middleware Nuxt + automatische redirect na login
**Businesswaarde**: Beschermt alle pagina's behalve /login zonder per-pagina herhaling.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** een niet-ingelogde gebruiker op /employees, **when** de route wordt geladen, **then** wordt geredirect naar /login?redirect=/employees
- **Given** een succesvolle login terwijl `redirect`-parameter aanwezig is, **when** login compleet, **then** navigeert de app naar de oorspronkelijke URL
- **Given** een ingelogde gebruiker op /login, **when** de pagina laadt, **then** redirect naar /

### AUTH-0008 — Bestaande employee-endpoints beveiligen (verwijder x-headers)
**Businesswaarde**: Demo-stack werkt niet meer met nep-headers in productie — dit sluit het veiligheidslek van Sprint 1.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** de auth-middleware actief op alle `/employees`-routes, **when** een request binnenkomt zonder geldig JWT, **then** retourneert 401
- **Given** de frontend, **when** een API-call wordt gemaakt, **then** stuurt de `useApi`-composable automatisch de Authorization-header mee vanuit de sessie-store
- **Given** staging na deploy, **when** de smoke-test draait, **then** zijn er geen `x-tenant-id`- of `x-user-id`-headers meer in gebruik op productie-routes

### AUTH-0009 — E2E login happy-path + unhappy-path (Playwright)
**Businesswaarde**: Automatische regressiebeveiliging zodat auth nooit stilletjes breekt bij een deploy.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** de Playwright-suite op staging, **when** happy-path login-test draait, **then** logt een testgebruiker in, ziet de employee-lijst, en logt uit — alles < 10s
- **Given** de Playwright-suite, **when** unhappy-path (fout wachtwoord) draait, **then** ziet de test het foutbericht op /login en de URL blijft /login
- **Given** een verlopen access_token (gesimuleerd door tijdstip te manipuleren), **when** de gebruiker een API-call doet, **then** herhaalt de app de call na refresh — transparant voor de gebruiker

## Risico's en afhankelijkheden

- **Risico**: httpOnly-cookie vs localStorage voor refresh-token — architect beslist in ADR. Aanname voor nu: httpOnly-cookie (veiliger, CSRF-mitigatie vereist). Dit raakt de Nuxt SSR-context; frontend moet hier vroeg op wachten.
- **Risico**: Rate-limiting zonder Redis is niet distributie-safe op meerdere Fly-instanties. Mitigatie: Fly draait één instantie in Sprint 2; Redis-optie als follow-up zodra horizontaal geschaald wordt.
- **Afhankelijkheid**: AUTH-0001 (schema + migratie) moet gemerged zijn voordat AUTH-0002 t/m AUTH-0008 kunnen starten. Architect en backend hebben dag 1 nodig voor ADR + schema — daarna kunnen alle andere stories parallel.
- **Afhankelijkheid**: AUTH-0004 (middleware) moet af zijn voordat AUTH-0008 (endpoints beveiligen) kan starten.

## Openstaande vragen

1. **Cookie-strategie**: httpOnly-cookie (CSP + CSRF-header nodig) vs Authorization-header met localStorage (eenvoudiger voor Nuxt SSR, maar XSS-risico). Architect beslissing — bepaalt AUTH-0006 implementatie.
2. **Tenant-detectie via subdomain**: `tenant-a.app.larsvdloo.com` of via login-formulier (e-mail-domein lookup)? Voor Sprint 2 aanname: tenant wordt bepaald via JWT-claim na login; subdomain-routing is Sprint 3+ zodra multi-tenant-demo nodig is.
3. **Seed-data voor E2E**: devops-qa heeft een Playwright-testgebruiker nodig in de Neon-database. Wie maakt de seed-migration? Aanname: backend levert `prisma/seed.ts` als onderdeel van AUTH-0001.

## Success metrics

- Login-flow end-to-end werkend op `app.larsvdloo.com` — geen nep-headers meer in productie.
- Playwright E2E happy-path groen in CI (deploy-demo-workflow).
- Tenant-isolatie-probe: gebruiker van tenant A kan data van tenant B niet zien (geautomatiseerde test).
- Alle employee-endpoints retourneren 401 bij ontbrekend token (smoke-test in deploy-pipeline).
- Auth-middleware < 5ms overhead op p95 (gemeten via Fastify-plugin logging).

## Dispatch-volgorde (voor orchestrator)

**Dag 1 — parallel:**
- `architect`: ADR auth-strategie (cookie vs header, JWT-claims, RLS-uitbreiding users-tabel), Zod-contract `packages/contracts/src/auth/`, schema-update `packages/db/prisma/schema.prisma`

**Dag 2 — na architect-ADR:**
- `backend`: AUTH-0001 (migratie + registratie) → AUTH-0002 (login) → AUTH-0003 (refresh) → AUTH-0004 (middleware) sequentieel; AUTH-0005 (RBAC) parallel na AUTH-0004
- `frontend`: start AUTH-0006 (login-pagina + store) zodra contract bekend is — kan parallel aan backend

**Dag 3-4:**
- `backend`: AUTH-0008 (bestaande endpoints beveiligen) zodra AUTH-0004 af is
- `frontend`: AUTH-0007 (guard middleware) zodra AUTH-0006 af is

**Dag 5 (mid-sprint check):**
- `pm` + `architect`: is scope haalbaar? Zijn de cookie-strategie-vragen beantwoord?

**Dag 6-8:**
- `devops-qa`: AUTH-0009 (Playwright E2E) zodra staging van backend + frontend deployed is
- Integration testing + smoke tests in deploy-pipeline

**Dag 9-10:**
- Review + retro + release

## Changelog

- 2026-04-22: Sprint 2 gestart. Sprint 1 gesloten na dag 2 (bootstrap volledig). SAML/SSO bewust buiten scope gehouden — FEAT-0002b. INFRA-0003 + INFRA-0004 meegenomen als resterende technische schuld.
- 2026-04-22: INFRA-0003 en INFRA-0004 verwijderd uit Sprint 2 — al opgeleverd in Sprint 1.
