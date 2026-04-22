# ADR-0007: API runtime — Nitro server routes op Vercel (Optie 1)

- **Status**: accepted
- **Datum**: 2026-04-22
- **Auteur**: pm (initieel besluit) + architect (review, vragen 1-5, definitieve acceptatie)
- **Reviewers**: pm, backend, devops-qa
- **Gerelateerd**: ADR-0004 (Fly.io demo-hosting — superseded), ADR-0005 (Prisma dual-URL — blijft geldig), ADR-0006 (auth-cookie-strategie — addendum dezelfde commit), SPRINT-02.5

## Context

Fly.io free trial is verlopen. Gebruiker wil geen tweede betaalrelatie naast Vercel. Drie opties zijn afgewogen:

| Optie | Beschrijving |
|---|---|
| 1 | Alle API-logic naar Nuxt Nitro server routes (`apps/web/server/api/`). Één Vercel-deployment. |
| 2 | `apps/api/` als aparte Vercel project via `@vercel/node` serverless adapter op Fastify. |
| 3 | Fly.io betaald houden. Afgewezen door gebruiker (tweede betaalrelatie). |

Huidige API-stack: Fastify 5 + Prisma + Neon Postgres (pooled + directe URL via ADR-0005). In-memory rate-limiter (single-instance aanname), audit-log via DB-triggers, httpOnly-cookie auth per ADR-0006. BullMQ staat in de backlog (FEAT-0009 bulk-import) maar is nog niet gebouwd.

Projectfase: geen klanten, demo-driven. Auth-feature (Sprint 2) is functioneel klaar lokaal; login UI + auth-store + guard zijn done op Vercel. De blocker is dat de Fastify-API niet meer bereikbaar is na trial-einde.

## Besluit

**Wij kiezen Optie 1: alle backend-logic migreert naar Nitro server routes onder `apps/web/server/api/`.**

Rationale:

1. **Demo-fase heeft geen cold-start budget**: Optie 2 geeft ~500ms cold starts per request. Voor een demo is dat funest. Nitro op Vercel draait als Vercel Functions die warm blijven zolang de deployment actief is en bovendien dezelfde container delen voor SSR + API — geen tweede koud-startbron.
2. **In-memory rate-limiter is onmogelijk op Optie 2**: elke serverless invocation is een vers process. Onze token-bucket (ADR-0006, `rate-limit.ts`) werkt al niet meer bij horizontale schaling; op serverless is het broken by design. Nitro heeft hetzelfde probleem maar is gemakkelijker te repareren via Postgres-backed buckets (zie V2 hieronder).
3. **Geen CORS meer**: frontend en server routes vallen onder hetzelfde origin (`app.larsvdloo.com`). Dit elimineert de gehele CORS-configuratie, de `Domain=.larsvdloo.com` cookie-scope, en de `CORS_ALLOWED_ORIGINS` env-var.
4. **Één deployment, één betaalrelatie**: Vercel Hobby blijft gratis. Geen Fly.io rekening.
5. **Neon blijft onveranderd**: Prisma client + dual-URL patroon (ADR-0005) werkt identiek vanuit Nitro. Neon serverless driver is een optie maar geen vereiste — Prisma's connection pooler is voldoende voor demo-load op Neon Postgres.
6. **Audit-log triggers zitten in DB**: die blijven onveranderd, onafhankelijk van API-runtime.

## Antwoorden op de openstaande vragen (architect-review, dag 1 sprint 2.5)

### V1 — PII-redaction in logger

**Besluit: pino-instance in `apps/web/server/utils/logger.ts` met identieke `redact`-config als de Fastify-stack, gebonden aan `event.context.log` via een Nitro-plugin (`server/plugins/00.logger.ts`).**

Rationale:

- `consola` (Nitro default) heeft géén structurele PII-redaction. Een eigen wrapper bouwen kost meer regels dan pino hergebruiken.
- pino is al transitive dep via Fastify; we trekken het expliciet in `apps/web/package.json` (~150 KB). Vercel Functions bundle-budget is ruim genoeg.
- Identieke `redact`-paden als `apps/api/src/app.ts` voorkomt dat we per ongeluk verschillende compliance-bewijzen hebben tussen oude en nieuwe stack tijdens de overgang.
- Per-request child-logger met `requestId` (uit `x-request-id`-header of UUID-fallback) + `userId`/`tenantId` (na auth-context) verrijkt logs zonder PII te lekken.
- Vercel Function-logs vangen pino's stdout JSON automatisch op. Geen extra transport-config nodig in productie. Lokaal `pino-pretty` als dev-dep voor leesbaarheid.

Stub aanwezig: [`apps/web/server/utils/logger.ts`](../../apps/web/server/utils/logger.ts). Backend rondt af in INFRA-0018 (middleware) door de Nitro-plugin te schrijven en `requestLogger()` per request aan te roepen.

**Compliance-bewijs**: redact-paden zijn 1-op-1 overgenomen (auth-headers, cookies, set-cookie, password, password_hash, bsn, iban, phoneNumber, address + wildcards). Wijziging vereist nieuwe ADR-revisie.

### V2 — Rate-limiter keuze

**Besluit: Postgres-backed rate-limit buckets in een nieuwe tabel `rate_limit_buckets`. GEEN Vercel KV.**

Drie opties zijn afgewogen — PM-voorkeur was Postgres, architect bevestigt:

| Optie | Voor | Tegen | Verdict |
|---|---|---|---|
| Vercel KV (Upstash Redis) | Sub-ms latency; native Nitro `useStorage` integratie | Vendor-lock-in op Upstash; per-tenant data verlaat Postgres-boundary; gratis-tier (30k commands/dag) is plafond zodra we MAU groeien; KV-data ligt buiten ons EU-region-statement (Upstash multi-region default) | Afgevallen |
| Postgres-backed (`rate_limit_buckets`-tabel) | Eén datastore = één auditboundary; data residency consistent met ADR-0002 EU-policy; geen extra vendor; trivial te porten naar AWS RDS | ~3-5ms extra latency per check vs in-memory/KV; één extra tabel + index | **Gekozen** |
| Skip tot Sprint 3 | Snelste path-to-demo | Brute-force-bescherming op `/login` valt weg — onacceptabel zelfs in demo-fase met publieke seed-credentials | Afgevallen |

Schema-shape (architect-spec, backend implementeert in INFRA-0019):

```prisma
/// In-memory token-bucket vervanger voor Nitro-serverless.
/// Compositie-key: (bucketKey) waarbij bucketKey = "<ip>:<lowercase_email>".
/// Geen tenant_id: rate-limit is pre-tenant-resolve (bij login weten we de tenant nog niet).
/// Bewust GEEN RLS — dit is geen tenant-data en de tabel mag nooit verlaten worden door queries.
model RateLimitBucket {
  bucketKey   String    @id @map("bucket_key")
  count       Int       @default(0)
  resetAt     DateTime  @map("reset_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([resetAt])
  @@map("rate_limit_buckets")
}
```

Algoritme (atomic UPSERT, race-safe):

```sql
-- recordFailedAttempt(bucketKey, windowMs, maxAttempts):
INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
VALUES ($1, 1, now() + ($2 || ' milliseconds')::interval)
ON CONFLICT (bucket_key) DO UPDATE
  SET count   = CASE WHEN rate_limit_buckets.reset_at < now()
                     THEN 1
                     ELSE rate_limit_buckets.count + 1 END,
      reset_at = CASE WHEN rate_limit_buckets.reset_at < now()
                     THEN now() + ($2 || ' milliseconds')::interval
                     ELSE rate_limit_buckets.reset_at END
RETURNING count, reset_at;
-- block als count > $3
```

Cleanup: lazy bij elke INSERT (bovenstaand UPSERT herinitialiseert verlopen rijen). Periodieke harde DELETE via Vercel Cron (1×/dag, `DELETE WHERE reset_at < now() - INTERVAL '1 day'`) als follow-up; voor Sprint 2.5 is lazy voldoende.

Performance-aanname (architect): Postgres UPSERT op een `id`-key blijft < 5ms p95 op Neon pooled connection. Login-flow heeft al 100ms bcrypt — extra 5ms is verwaarloosbaar. Backend bevestigt na implementatie via load-test.

### V3 — Nitro middleware-structuur

**Besluit: mapping van Fastify-plugins op Nitro-equivalenten met expliciete sequencing-prefix in filenames.**

Nitro voert middleware in alfabetische volgorde uit (zie [Nitro routing docs](https://nitro.unjs.io/guide/routing#route-middleware)). We gebruiken `NN.<naam>.ts` om een deterministische volgorde af te dwingen. Plugins (`server/plugins/`) draaien éénmaal bij Nitro init — bedoeld voor app-level wiring (logger, error-hook, rate-limit-warmup), NIET voor per-request logica.

| Fastify-construct | Nitro-equivalent | Locatie | Reden |
|---|---|---|---|
| Pino-logger config in `Fastify({ logger })` | Nitro-plugin | `server/plugins/00.logger.ts` | Bindt `logger`-export aan `nitroApp.hooks.hook('request', ...)` zodat `event.context.log` per request gevuld wordt. |
| `@fastify/cors` plugin | — | (vervalt) | Same-origin: geen CORS-headers nodig. |
| `@fastify/helmet` plugin | `vercel.json` headers + Nuxt `app.head` security-meta | `apps/web/vercel.json` | CSP/X-Frame/X-Content-Type/Referrer-Policy zijn nu al gezet in `vercel.json`. Voldoende voor demo. |
| `@fastify/rate-limit` plugin | Per-route helper `enforceRateLimit(event, key)` | `server/utils/rate-limit.ts` | Bewust niet als globale middleware — alleen `/auth/login` en `/auth/register` hebben rate-limiting nodig. Globale 300/min is overbodig op serverless (Vercel zelf throttled). |
| `@fastify/cookie` plugin | h3's ingebouwde `getCookie`/`setCookie`/`deleteCookie` | (gebundeld met h3) | Geen extra dep nodig. Cookie-secret was alleen voor signed cookies — wij gebruiken geen signed cookies (refresh-token zit al in DB-hash). |
| `auth-context` Fastify-hook (`onRequest`) | Nitro middleware | `server/middleware/02.auth-context.ts` | Parst `Authorization: Bearer`, valideert JWT, zet `event.context.user`. |
| `tenant-context` plugin (shim) | Inline in `02.auth-context.ts` | (zelfde file) | De Sprint-2 shim was overbodig zodra `event.context.user` bestaat — tenantId wordt direct uit `event.context.user.tenantId` gelezen door services. |
| `error-handler` (`setErrorHandler`) | Nitro-plugin met `nitroApp.hooks.hook('error', ...)` + per-route `try/catch` of `defineEventHandler`-wrapper | `server/plugins/01.error-handler.ts` | Nitro's error-hook handelt unhandled errors af; de wrapper zet ZodError → 422 + service-thrown errors → RFC 7807. |
| `genReqId` (`x-request-id` of UUID) | Nitro middleware | `server/middleware/00.request-id.ts` | Zet `event.context.requestId` + zet response-header. |
| Security-headers (helmet) | Nitro middleware (defensief) | `server/middleware/00.security-headers.ts` | `vercel.json` zet headers globaal, maar voor `/api/*` willen we ook `Cache-Control: no-store` zodat tussen-proxies niets cachen. Korte middleware. |

**Folder-structuur target** (skelet aanwezig in repo):

```
apps/web/server/
├── api/
│   └── v1/
│       ├── auth/
│       │   ├── login.post.ts          # POST /api/v1/auth/login
│       │   ├── refresh.post.ts        # POST /api/v1/auth/refresh
│       │   ├── logout.post.ts         # POST /api/v1/auth/logout
│       │   └── register.post.ts       # POST /api/v1/auth/register
│       └── employees/
│           ├── index.get.ts           # GET    /api/v1/employees
│           ├── index.post.ts          # POST   /api/v1/employees
│           ├── [id].get.ts            # GET    /api/v1/employees/:id
│           ├── [id].patch.ts          # PATCH  /api/v1/employees/:id
│           ├── [id].delete.ts         # DELETE /api/v1/employees/:id
│           └── [id]/
│               └── reveal.post.ts     # POST   /api/v1/employees/:id/reveal
├── middleware/
│   ├── 00.request-id.ts               # x-request-id of UUID → event.context.requestId
│   ├── 00.security-headers.ts         # Cache-Control no-store voor /api/*
│   ├── 01.request-log.ts              # event.context.log = requestLogger({...})
│   └── 02.auth-context.ts             # JWT-validatie → event.context.user, skip publieke paden
├── plugins/
│   ├── 00.logger.ts                   # Bindt logger-instance aan nitroApp
│   └── 01.error-handler.ts            # nitroApp.hooks.hook('error', ...)
└── utils/
    ├── logger.ts                      # pino-instance + requestLogger() (stub aanwezig)
    ├── prisma.ts                      # getPrisma() / withTenant() re-export uit @hr-saas/db
    ├── validate.ts                    # validateBody/validateQuery helpers met Zod
    ├── auth.ts                        # requireUser/requireRole helpers (event.context-based)
    ├── cookies.ts                     # setAuthCookies/clearAuthCookies (same-origin, geen Domain)
    └── rate-limit.ts                  # Postgres-backed enforceRateLimit (zie V2)
```

**Belangrijke H3-aannamen die backend MOET respecteren**:

- Body lezen: `await readBody(event)` — geeft een al geparseerde JSON. Vóór doorgeven aan service: `validateBody(event, zodSchema)` (helper, zie `validate.ts`).
- Query lezen: `getQuery(event)` — geeft `Record<string, string>`; cast naar Zod-schema voor types.
- Status zetten: `setResponseStatus(event, 201)` (impliciete return blijft 200).
- Cookies: `setCookie(event, name, value, opts)` — accepteert dezelfde opts-shape als Fastify.
- Errors: `throw createError({ statusCode: 4xx, data: { ... } })` of throw een eigen `Error` met `statusCode`-property; de error-plugin vangt beide op.
- Asynchrone handlers MOETEN `defineEventHandler` gebruiken; geen plain async functions. De wrapper `withErrorHandling` (zie utils) is optioneel maar aanbevolen voor uniforme RFC 7807-output.

### V4 — Cookie scope same-origin

**Besluit: cookies krijgen GEEN `Domain`-attribuut. `SameSite=Lax`, `HttpOnly` (refresh) en `Secure` (productie) blijven ongewijzigd. ADR-0006 krijgt addendum bij dezelfde commit.**

Toelichting:

- Bij same-origin (`app.larsvdloo.com` zowel frontend als API) is `Domain` overbodig en zelfs onveiliger: een gezette `Domain=.larsvdloo.com` zou de cookie ook naar willekeurige andere subdomains lekken (`marketing.larsvdloo.com`, `staging.larsvdloo.com`, etc.). Default-behavior (geen `Domain`) bindt de cookie aan exact `app.larsvdloo.com` — wat we willen.
- `Path=/api/v1/auth` (i.p.v. de oude `/v1/auth`) is logisch, want Nitro mount onder `/api/`. Backend implementeert dat in `cookies.ts`-helper.
- Lokaal (`localhost:3000`) blijft `secure: false` + geen `Domain`. De `cookieDomain()`-helper uit de Fastify-versie kan in z'n geheel verdwijnen — geen if/else meer, gewoon nooit een `Domain`-attribuut.

Zie `docs/adr/0006-auth-cookie-strategie.md` § Addendum 2026-04-22 voor de officiële update van ADR-0006.

### V5 — `apps/api/` lifecycle

**Besluit: `apps/api/` blijft tijdelijk staan onder de huidige naam, wordt UITGESLOTEN van CI/build/test loops in INFRA-0021, en wordt in een follow-up sprint hernoemd naar `apps/api-fastify-archive/` met README "deprecated, see ADR-0007" zodra E2E op Nitro 7 dagen groen heeft gedraaid.**

Drie opties zijn afgewogen — PM-voorkeur was direct archief, architect kiest gefaseerd (uitsluiten → bewijs → archiveren):

| Optie | Voor | Tegen | Verdict |
|---|---|---|---|
| Direct archief (rename `apps/api-fastify-archive/`) | Onmiddellijke duidelijkheid; geen verwarring | Riskant: als Nitro-migratie blokkerend faalt, hebben we de import-paden naar `apps/api/src/` al gebroken in pnpm-workspace. Rollback is een rename-revert + nieuwe deploy. | Afgevallen |
| Direct verwijderen | Schoon | Verlies van Fastify-codebase als referentie tijdens migratie van auth-flow. Backend MOET tijdens INFRA-0016/0017 nog refereren naar `apps/api/src/modules/auth/service.ts` om gedrag exact te kopiëren. | Afgevallen |
| Gefaseerd: uitsluiten van CI nu, archiveren na 7d groene E2E op Nitro | Veilig: Fastify-code blijft beschikbaar als referentie tijdens migratie; CI faalt niet meer op Fly-credentials; we bewijzen eerst dat Nitro werkt voor we archiveren | Tijdelijk dubbel onderhoud: maximaal 2 weken | **Gekozen** |

Concrete stappen (devops-qa in INFRA-0021):

1. `apps/api/` blijft als directory bestaan; broncode ongewijzigd.
2. CI workflow (`.github/workflows/ci.yml`): exclude `apps/api/**` uit lint/typecheck/test stappen via `--filter='!@hr-saas/api'` op pnpm-commands. Backend-tests die in `apps/api/` zitten worden niet gedraaid; dat is acceptabel want de Fastify-code wordt niet meer gedeployed.
3. Deploy workflow (`.github/workflows/deploy-demo.yml`): jobs `deploy-api` en de Fly-secrets-stap volledig verwijderen. Smoke-test `api.larsvdloo.com` verwijderen.
4. README in `apps/api/` toevoegen: "DEPRECATED — Sprint 2.5 (ADR-0007). Code blijft beschikbaar als referentie tijdens Nitro-migratie. Wordt gearchiveerd na 7 dagen groene E2E op Nitro-stack."
5. Sprint 3 dag 1 (architect-actie): rename naar `apps/api-fastify-archive/` als E2E groen blijft.

**Veiligheids-gate voor verwijdering**: pas wanneer (a) E2E 7 dagen groen op `app.larsvdloo.com`, (b) Nitro-versie van alle Sprint 2-endpoints live, (c) geen rollback-actie nodig geweest. Architect bevestigt in Sprint 3 backlog-grooming.

## Consequenties

### Positief

- Geen CORS-configuratie meer; vereenvoudigt auth-cookie-setup aanzienlijk.
- Eén Vercel-project, één deployment-pipeline. DevOps-overhead halveert.
- Fastify-specifieke boilerplate vervalt: `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, `fastify-type-provider-zod`. Minder dependencies, kleiner surface.
- `apps/api/` directory kan na 7d groene E2E gearchiveerd worden (V5).
- INFRA-0009 (AWS-migratie) verschuift naar "later" — Vercel is nu de productie-stack voor de demo-fase.
- Rate-limiting wordt **beter** dan voorheen: Postgres-backed werkt over alle Vercel function-instances, terwijl in-memory single-instance was.

### Negatief / trade-offs

- **Significante code-migratie**: elke Fastify route-handler (`controller.ts` x2 + auth x4 endpoints + employees) wordt omgezet naar Nitro `defineEventHandler`. Geschat backend-werk: 2-3 dagen voor auth + employees inclusief tests.
- **Pino is een nieuwe dep voor `apps/web/`**: `pino` + `pino-pretty` (dev-only) toegevoegd. ~150 KB extra bundle voor functies, acceptabel binnen Vercel-budget.
- **Rate-limit DB-roundtrip**: ~5ms extra latency op login-pad. Verwaarloosbaar t.o.v. bcrypt-100ms.
- **BullMQ blijft incompatibel met serverless**: FEAT-0009 (bulk-import via queue) kan niet op Vercel Functions. Mitigatie: FEAT-0009 staat als idea in backlog, is niet Sprint 2.5 scope. Wanneer queues nodig zijn: Vercel Cron + Neon-tabel als job-queue (simpel), of aparte worker-service. Dit is een bekende trade-off, niet onoplosbaar.
- **`apps/api/` blijft tijdelijk bestaan** maar wordt uitgesloten van CI (V5). Risico op dubbel onderhoud beperkt tot Sprint 2.5 + 1 sprint follow-up.

### Neutraal

- Neon Postgres en Prisma blijven onveranderd. ADR-0005 is volledig geldig.
- E2E Playwright-tests (AUTH-0009) moeten URL-configuratie updaten (geen `api.larsvdloo.com` meer, alleen `app.larsvdloo.com/api/v1/...`).
- `api.larsvdloo.com` DNS-record kan worden verwijderd of omgeleid na migratie. Domein-strategie: alle API-calls via `app.larsvdloo.com/api/v1/...` (Nitro conventie: `server/api/` routes zijn beschikbaar onder `/api/...`).
- Audit-events ongewijzigd: triggers in DB schrijven onafhankelijk van runtime.

## Alternatieven overwogen

### Alternatief A: Vercel Functions met Fastify adapter (Optie 2)

- **Overwogen**: minder code-migratie, Fastify blijft.
- **Afgevallen**: cold starts (~500ms) zijn onacceptabel voor demo. In-memory rate-limiter broken op serverless. Prisma per-request init is kostbaar zonder connection pooling (Neon serverless driver lost dit deels op maar voegt complexiteit toe). BullMQ is sowieso onmogelijk op Functions. De nadelen wegen zwaarder dan de migratiekost van Optie 1.

### Alternatief B: Fly.io betaald houden (Optie 3)

- **Overwogen**: nul migratie, alles blijft werken.
- **Afgevallen**: expliciet afgewezen door gebruiker (tweede betaalrelatie). Niet negotiable.

### Alternatief C: Neon serverless driver als vervanging voor Prisma + connection pool

- **Overwogen**: Neon biedt een HTTP-gebaseerde driver die beter past bij serverless (geen langlevende connections nodig).
- **Aangehouden als optie**: architect bepaalt of dit de juiste trade is. Voor Sprint 2.5: Prisma + Neon pooled URL volstaat voor demo-load. Serverless driver is een optimalisatie, geen vereiste. Activeren wanneer Vercel Function-logs herhaaldelijk `connection_exhausted` tonen — dan apart ADR (raakt ADR-0005).

### Alternatief D: Vercel KV als rate-limit-store (V2-alternatief)

- **Overwogen**: native Nitro `useStorage`-integratie, sub-ms latency.
- **Afgevallen**: vendor-lock-in op Upstash, data-residency-claim verzwakt (Upstash multi-region default), één extra service om te observeren. Postgres-backed is consistent met onze EU-region-policy en blijft werken zodra we naar AWS RDS migreren (ADR-0009 future).

### Alternatief E: Direct verwijderen `apps/api/` (V5-alternatief)

- **Overwogen**: schoner workspace.
- **Afgevallen**: backend heeft tijdens INFRA-0016/0017 referentie nodig naar Fastify-service-laag om gedrag exact te repliceren. Verwijderen vóór de Nitro-versie groen is = onnodig risico.

## Vervolgactie

- [x] Architect (INFRA-0015): ADR-0007 status `accepted`, vragen 1-5 beantwoord.
- [x] Architect: ADR-0006 addendum (cookie-scope same-origin).
- [x] Architect: build plan `docs/specs/api-vercel-migratie-buildplan.md`.
- [x] Architect: folder-structuur `apps/web/server/{api,middleware,plugins,utils}/` skelet aangemaakt.
- [x] Architect: logger-utility-stub `apps/web/server/utils/logger.ts`.
- [ ] Backend (INFRA-0018): Nitro-middleware (`00.request-id.ts`, `00.security-headers.ts`, `01.request-log.ts`, `02.auth-context.ts`) + plugins (`00.logger.ts`, `01.error-handler.ts`) + utils (`prisma.ts`, `validate.ts`, `auth.ts`, `cookies.ts`).
- [ ] Backend (INFRA-0019): `RateLimitBucket`-tabel + Prisma-migratie + `server/utils/rate-limit.ts`.
- [ ] Backend (INFRA-0016): `auth/{login,refresh,logout,register}.post.ts` migreren.
- [ ] Backend (INFRA-0017): `employees/*` migreren.
- [ ] Backend: `pino` + `pino-pretty` (dev) toevoegen aan `apps/web/package.json`.
- [ ] Frontend (INFRA-0020): `useApi` baseURL al relatief — verifiëren + `nuxt.config.ts` runtimeConfig `apiBase` verwijderen.
- [ ] DevOps-QA (INFRA-0021): `deploy-demo.yml` Fly-jobs verwijderen + `apps/api/**` excluden uit `ci.yml`.
- [ ] DevOps-QA (INFRA-0022): DNS `api.larsvdloo.com` opruimen na E2E groen.
- [ ] DevOps-QA (INFRA-0023): Playwright `E2E_API_BASE_URL` weghalen, alleen `E2E_BASE_URL`.
- [ ] Architect (Sprint 3 dag 1): rename `apps/api/` → `apps/api-fastify-archive/` na 7d groene E2E op Nitro.
