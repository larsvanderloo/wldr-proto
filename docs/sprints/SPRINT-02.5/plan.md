# Sprint 02.5 — Plan (mini-sprint: Vercel-migratie)

- **Periode**: 2026-04-22 t/m 2026-04-29 (1 week; halve sprint)
- **Scrum-master / facilitator**: pm
- **Status**: in-progress

## Sprintdoel

De login-flow werkt publiek op `app.larsvdloo.com` zonder Fly.io — alle backend-logic draait als Nitro server routes op Vercel, zonder CORS, zonder nep-headers.

## Context en beslissing

Fly.io trial is verlopen. Pivot naar Vercel-only (Optie 1: Nitro server routes). Besluit vastgelegd in ADR-0007. Sprint 2 auth-feature is functioneel klaar lokaal + Vercel-frontend; de API-laag moet nu worden gemigreerd.

**Aanname**: architect bevestigt ADR-0007 binnen dag 1 van deze sprint. Backend start niet vóór architect akkoord.

## Capaciteit

| Agent | Beschikbaarheid | Noten |
|---|---|---|
| pm | 60% | Backlog-onderhoud, sprintbewaking |
| architect | 100% | ADR-0007 review + build plan + Nitro-middleware-spec |
| backend | 100% | Migratie Fastify → Nitro server routes |
| frontend | 50% | `useApi` base-URL aanpassen; testen same-origin flow |
| devops-qa | 80% | CI/CD pipeline Fly-stap verwijderen; E2E herbevestigen |

## Stories in deze sprint

| ID | Titel | Priority | Routing | Inschatting | Status |
|---|---|---|---|---|---|
| INFRA-0015 | ADR-0007 review + Nitro build plan | P0 | architect | S | ready |
| INFRA-0016 | Nitro server routes: auth-endpoints migreren (login/refresh/logout/register) | P0 | backend | M | blocked (wacht op INFRA-0015) |
| INFRA-0017 | Nitro server routes: employee-endpoints migreren | P0 | backend | S | blocked (wacht op INFRA-0016 middleware) |
| INFRA-0018 | Nitro middleware: auth-context + tenant-context + error-handler | P0 | backend | S | blocked (wacht op INFRA-0015) |
| INFRA-0019 | Rate-limiter vervanging op Nitro (Vercel KV of DB-backed) | P0 | architect beslissing → backend | S | blocked (wacht op INFRA-0015) |
| INFRA-0020 | Frontend: `useApi` base-URL relatief maken (`/api/v1`) | P0 | frontend | S | ready |
| INFRA-0021 | CI/CD: Fly.io stap verwijderen uit `deploy-demo.yml`, Vercel-only pipeline | P0 | devops-qa | S | ready |
| INFRA-0022 | DNS: `api.larsvdloo.com` record verwijderen of redirecten na migratie | P1 | devops-qa | S | blocked (wacht op INFRA-0016 live) |
| INFRA-0023 | E2E: Playwright URL-config updaten + smoke-test op nieuwe endpoints | P0 | devops-qa | S | blocked (wacht op INFRA-0016 live) |

## Story-details

### INFRA-0015 — ADR-0007 review + Nitro build plan
**Businesswaarde**: Zonder architect-akkoord begint backend aan de verkeerde implementatie.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** de ADR-0007 stub, **when** architect het reviewt, **then** zijn de vijf openstaande vragen beantwoord (PII-logging, rate-limiter, Nitro-middleware, cookie-scope, `apps/api/` lifecycle)
- **Given** ADR-0007 accepted, **when** architect het build plan schrijft, **then** bevat het: (a) middleware-structuur Nitro, (b) logging-aanpak met PII-redaction, (c) rate-limiter keuze, (d) cookie-aanpassing same-origin, (e) benodigde Nitro-packages
- **Given** het build plan, **when** backend de migratie start, **then** zijn er geen architecturale vragen meer open

### INFRA-0016 — Nitro server routes: auth-endpoints migreren
**Businesswaarde**: Login werkt publiek op Vercel — dit is het succescriterium van de pivot.
**Inschatting**: M | **Priority**: P0

Acceptatiecriteria:
- **Given** `apps/web/server/api/v1/auth/login.post.ts` bestaat, **when** `POST /api/v1/auth/login` aanroep, **then** retourneert 200 met access_token + zet httpOnly-cookie `hr_refresh` + `hr_csrf` (zelfde gedrag als huidig Fastify-equivalent)
- **Given** `POST /api/v1/auth/refresh`, **when** geldig refresh-token cookie + CSRF-header, **then** retourneert nieuw access_token + geroteerd cookie
- **Given** `POST /api/v1/auth/logout`, **when** aanroep, **then** cookies worden gecleared + refresh_token gerevoked in DB
- **Given** `POST /api/v1/auth/register`, **when** geldige payload + hr_admin JWT, **then** retourneert 201
- **Given** een publieke endpoint (login, refresh, logout), **when** aanroep zonder JWT, **then** geen 401 van auth-middleware
- **Given** de Prisma-client, **when** Nitro server route init, **then** wordt de pooled Neon-URL gebruikt (ADR-0005); geen connection-leak per request

### INFRA-0017 — Nitro server routes: employee-endpoints migreren
**Businesswaarde**: De employee-CRUD blijft werken na de pivot.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** `GET /api/v1/employees`, **when** aanroep met geldig JWT, **then** retourneert employees van de tenant (RLS actief)
- **Given** `GET /api/v1/employees/:id`, **when** employee van andere tenant, **then** 404
- **Given** request zonder JWT op beveiligde route, **when** aanroep, **then** 401

### INFRA-0018 — Nitro middleware: auth-context + tenant-context + error-handler
**Businesswaarde**: Auth- en tenant-scope-enforcement zit centraal, niet per route herhaald.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** een beveiligde Nitro route, **when** request binnenkomt, **then** is `event.context.user = { id, tenantId, role }` beschikbaar
- **Given** een request op een beveiligde route, **when** JWT ontbreekt of verlopen, **then** retourneert 401 met `error: "token_expired"` of `"unauthorized"`
- **Given** een Zod-validatiefout in een route-handler, **when** de error-handler hem afvangt, **then** retourneert 422 met gestructureerde foutmelding (identiek aan huidig Fastify error-handler gedrag)
- **Given** PII-velden in logs (`password`, `bsn`, `iban`, `authorization`-header), **when** een log-statement draait, **then** zijn ze geredact (architect specificeert mechanisme)

### INFRA-0019 — Rate-limiter vervanging op Nitro
**Businesswaarde**: Brute-force bescherming op login blijft werken, ook op serverless.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** architect keuze (Vercel KV of DB-backed), **when** de rate-limiter geimplementeerd is, **then** blockeert hij na 3 mislukte pogingen per (ip, email) binnen 5 minuten
- **Given** een geblokkeerde user, **when** POST /api/v1/auth/login, **then** retourneert 429 met `Retry-After`-header
- **Given** Vercel KV als keuze, **when** de gratis tier (30MB/mo) overschreden is, **then** is er een fallback-strategie gedocumenteerd (aanname: degraded mode — log + geen block, beter dan exception)
- **Aanname**: in-memory bucket (`rate-limit.ts`) wordt niet meegenomen naar Nitro — die file vervalt

### INFRA-0020 — Frontend: `useApi` base-URL relatief
**Businesswaarde**: Frontend hoeft niet meer te weten waar de API staat — same-origin lost het op.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** `useApi`-composable, **when** een API-call gemaakt wordt, **then** is de base-URL `/api/v1` (relatief, geen absolute URL meer)
- **Given** de Nuxt SSR-context, **when** server-side rendering, **then** werken de API-calls via de interne Nitro-router zonder extra proxy-config
- **Given** `NUXT_PUBLIC_API_BASE` of vergelijkbare env-var, **when** die bestaat, **then** wordt hij verwijderd of overbodig
- **Given** de CORS-plugin in `apps/web/`, **when** die bestaat, **then** wordt hij verwijderd (geen cross-origin meer)

### INFRA-0021 — CI/CD: Fly.io stap verwijderen
**Businesswaarde**: Pipeline faalt niet meer op Fly-credentials die niet meer bestaan.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** `deploy-demo.yml`, **when** de workflow draait, **then** zijn er geen Fly.io stappen meer (`flyctl deploy`, `fly secrets`, etc.)
- **Given** de workflow, **when** een push op `main`, **then** deployt alleen naar Vercel (web + server routes in één deployment)
- **Given** GitHub Actions secrets, **when** na cleanup, **then** zijn `FLY_API_TOKEN` en `FLY_APP_NAME` verwijderd of gemarkeerd als obsolete

### INFRA-0022 — DNS: `api.larsvdloo.com` opruimen
**Businesswaarde**: Geen dode DNS-records die verwarring wekken of security-risico vormen.
**Inschatting**: S | **Priority**: P1

Acceptatiecriteria:
- **Given** de Vercel/Cloudflare DNS-config, **when** `api.larsvdloo.com` niet meer nodig is, **then** is het record verwijderd of geredirect naar `app.larsvdloo.com`
- **Given** de verwijdering, **when** een request op `api.larsvdloo.com`, **then** krijgt de caller een duidelijke 301 of DNS NXDOMAIN (geen stille mislukking)

### INFRA-0023 — E2E: Playwright URL-config updaten + smoke-test
**Businesswaarde**: Automatische regressiebeveiliging bevestigt dat de pivot niet breekt wat Sprint 2 opleverde.
**Inschatting**: S | **Priority**: P0

Acceptatiecriteria:
- **Given** de Playwright-suite, **when** `BASE_URL` geconfigureerd is op `https://app.larsvdloo.com`, **then** lopen alle bestaande auth-tests groen (happy-path + unhappy-path)
- **Given** geen `api.larsvdloo.com`-referenties in Playwright-config, **when** de suite draait, **then** is er geen enkele hardcoded API-URL meer
- **Given** de smoke-test in CI, **when** een deploy compleet is, **then** verifieert hij: (1) login werkt, (2) employee-lijst is zichtbaar, (3) logout revoked de cookie

## Risico's en afhankelijkheden

1. **BLOCKER dag 1**: architect moet ADR-0007 accepten vóór backend begint. Als architect vragen heeft die langer duren, schuift INFRA-0016/0017/0018 op.
2. **PII-logging in Nitro**: dit is een compliance-punt. Als architect geen werkend mechanisme vindt voor PII-redaction in Nitro, dan bouwen we een dunne logging-wrapper vóór we migreren. Niet skippen.
3. **Rate-limiter keuze**: Vercel KV gratis tier is 30MB/mo — ruim voor demo maar begrensd. Als architect DB-backed kiest, is er extra Prisma-schema nodig (eenvoudig: `rate_limit_buckets` tabel). Architectkeuze, niet PM-keuze.
4. **`apps/api/` bestaat nog**: de Fastify-app blijft staan totdat alle tests groen zijn op de Nitro-versie. Risico op dubbel onderhoud als de sprint uitloopt. Mitigatie: INFRA-0021 (CI/CD) verwijdert de Fly-deploy dag 1 — de Fastify-code is dan lokaal beschikbaar maar niet deployed.
5. **Neon serverless driver**: PM-aanname is dat Prisma + pooled URL voldoet. Als Nitro functions connection-exhaustion vertonen (veel koude starts), is de Neon serverless driver de fallback. Architect houdt dit in de gaten bij build plan.
6. **BullMQ**: FEAT-0009 (bulk-import) is incompatibel met Vercel serverless. Dit is een bekende trade-off, gedocumenteerd in ADR-0007. Geen actie in Sprint 2.5; wordt adresbaar bij Sprint 3+ wanneer FEAT-0009 scope wordt.

## Success metrics

- Login-flow end-to-end werkend op `app.larsvdloo.com` zonder Fly.io — publiek bereikbaar, geen CORS-errors.
- Playwright auth-suite groen in CI op Vercel-only deployment.
- Geen `api.larsvdloo.com`-referenties meer in codebase of CI-config.
- `deploy-demo.yml` draait zonder Fly-credentials.
- Auth-middleware < 10ms overhead op p95 (iets ruimer dan Fastify-target vanwege Nitro overhead; architect bevestigt acceptabele grens).

## Dispatch-volgorde (voor orchestrator)

**Dag 1 — parallel starten:**
- `architect`: INFRA-0015 — ADR-0007 accepten + openstaande vragen beantwoorden + build plan schrijven
- `frontend`: INFRA-0020 — `useApi` base-URL relatief maken (geen blocker, frontend kan dit onafhankelijk)
- `devops-qa`: INFRA-0021 — Fly.io stap verwijderen uit CI/CD (geen blocker, pipeline-only)

**Dag 1-2 — na architect build plan (INFRA-0015 done):**
- `backend`: INFRA-0018 (middleware) + INFRA-0019 (rate-limiter) parallel starten
- `backend`: INFRA-0016 (auth-endpoints) zodra INFRA-0018 af is
- `backend`: INFRA-0017 (employee-endpoints) zodra INFRA-0016 auth-middleware beschikbaar is

**Dag 3 — integratie:**
- `devops-qa`: INFRA-0023 — Playwright suite updaten zodra Nitro-endpoints live zijn op staging/preview
- `devops-qa`: INFRA-0022 — DNS opruimen zodra E2E groen

**Dag 4-5 — afronden:**
- `pm` + `devops-qa`: smoke-test op productie, sprint review, backlog bijwerken
- `architect`: bevestigt `apps/api/` veilig te verwijderen na groene E2E

## Changelog

- 2026-04-22: Sprint 2.5 geopend. Beslissing Optie 1 (Nitro) door PM op basis van demo-fase context, kostenconstraint, en technische argumenten (cold starts, CORS-eliminatie, in-memory rate-limiter incompatibiliteit). ADR-0007 stub aangemaakt. Sprint 2 gesloten.
