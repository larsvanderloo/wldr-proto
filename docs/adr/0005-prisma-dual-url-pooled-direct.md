# ADR-0005: Prisma dual-URL — pooled runtime, directe migrations

- **Status**: accepted
- **Datum**: 2026-04-21
- **Auteur**: architect
- **Reviewers**: backend, devops-qa
- **Gerelateerd**: ADR-0002 (multi-tenancy + RLS), ADR-0004 (demo-hosting Neon + Fly + Vercel)

## Context

Vanaf ADR-0004 draait de demo op Neon (managed Postgres). Neon levert per database **twee** connection-strings:

- Een **pooled** endpoint via PgBouncer in transaction-mode (host bevat typisch `-pooler` in de hostname). Bedoeld voor applicatie-runtime: lage connection-overhead, schaalt naar veel korte requests.
- Een **directe** endpoint die de pooler omzeilt en rechtstreeks op de Postgres-backend praat.

Hetzelfde patroon doet zich voor in de eindstaat (ADR-0002, AWS RDS): runtime via **RDS Proxy** (eveneens PgBouncer-achtig), migrations en `prisma introspect` rechtstreeks op de RDS-instance. De keuze is dus niet Neon-specifiek; het is een Prisma-deployment-conventie die we sowieso nodig hebben.

PgBouncer in **transaction-mode** breekt twee Postgres-features die `prisma migrate` actief gebruikt:

1. **Advisory locks** — Prisma neemt `pg_advisory_lock` op de migrations-tabel om concurrent migrations te voorkomen. In transaction-mode gaat de lock verloren zodra Prisma de connection teruggeeft aan de pool tussen statements; de volgende migrate-step zit op een andere backend-connection en ziet geen lock.
2. **Prepared statements / session state** — Prisma's migration engine produceert DDL met session-state-aannames (search_path, role-context). Transaction-mode multiplext sessions over backends; state lekt of verdwijnt.

Runtime-queries hebben hier géén last van mits ze binnen één transactie blijven, omdat een transactie in PgBouncer's transaction-mode aan één backend-connection geplakt wordt voor de duur van de transactie. Dat is precies hoe ons `withTenant()`-patroon werkt: alle queries zitten in `prisma.$transaction(...)` met `SET LOCAL app.tenant_id = ...` als eerste statement. Het werkt dus via de pooler.

De vraag: hoe configureren we Prisma zodat runtime via de pool gaat en migrations via de directe URL, zonder twee verschillende `PrismaClient`-instanties of aparte processes?

## Besluit

Wij gebruiken Prisma's ingebouwde **`directUrl`** datasource-veld. Eén `PrismaClient`, twee env-variabelen:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled — runtime queries
  directUrl = env("DIRECT_URL")     // direct — migrations, introspect, db push
}
```

Prisma gebruikt `directUrl` automatisch en uitsluitend voor:

- `prisma migrate dev` / `prisma migrate deploy` / `prisma migrate reset`
- `prisma db push` / `prisma db pull`
- `prisma introspect`

Voor runtime (`PrismaClient` queries, `$transaction`, `$executeRaw`) gebruikt Prisma altijd `url`.

**Belangrijk over Prisma's resolutie van `directUrl`**: zodra `directUrl = env("DIRECT_URL")` in `schema.prisma` staat, **eist** Prisma 5.22 dat de env-var ook gezet is — `prisma validate`, `prisma generate` (met env-loading) en alle migrate-commands falen anders met `P1012: Environment variable not found: DIRECT_URL`. Er is geen automatische fallback naar `url`. Daarom moet `DIRECT_URL` overal expliciet gezet worden, ook lokaal en in CI. Lokaal is dat triviaal: identieke string aan `DATABASE_URL` (geen PgBouncer in het pad).

### Env-conventie per omgeving

| Omgeving | `DATABASE_URL` | `DIRECT_URL` |
|---|---|---|
| Lokaal (`docker compose`) | `postgresql://hrsaas:hrsaas@localhost:5432/hrsaas` | identiek aan `DATABASE_URL` |
| CI (`.github/workflows/ci.yml`) | `postgresql://hrsaas:hrsaas@localhost:5432/hrsaas_test` | identiek aan `DATABASE_URL` |
| Demo (Neon) — Fly runtime | `postgresql://...@ep-xxx-pooler.eu-central-1.aws.neon.tech/hrsaas?sslmode=require&pgbouncer=true&connect_timeout=10` | `postgresql://...@ep-xxx.eu-central-1.aws.neon.tech/hrsaas?sslmode=require&connect_timeout=10` |
| Demo (Neon) — GitHub Actions deploy-job | gelijk aan `DIRECT_URL` (migrate gebruikt geen pool) | direct endpoint, voor `prisma migrate deploy` als pre-deploy step |
| Productie AWS (toekomst, ADR-0002) | RDS Proxy endpoint | RDS instance endpoint |

Belangrijke query-string parameters bij Neon pooled URL:

- `sslmode=require` — Neon dwingt TLS af.
- `pgbouncer=true` — vertelt Prisma om prepared-statement caching uit te zetten (cruciaal: zonder dit krijgen runtime-queries `prepared statement "sN" already exists`).
- `connect_timeout=10` — defensief tegen koude poolers.

Voor de directe URL is `pgbouncer=true` weggelaten omdat er geen pooler in het pad zit.

## Consequenties

### Positief

- Eén `PrismaClient`, één codepad. Geen runtime-detectie of conditional clients.
- Migrations kunnen veilig draaien als pre-deploy step in `deploy-demo.yml` met `DIRECT_URL` zonder dat de runtime-config wijzigt.
- Werkt identiek tegen de toekomstige AWS-stack (RDS Proxy + RDS direct) — geen rework bij ADR-0009 migratie.
- Lokaal en CI veranderen niet: als `DIRECT_URL` ontbreekt valt Prisma terug op `url`. Geen breaking change voor bestaande devs.
- RLS via `SET LOCAL app.tenant_id` blijft werken via beide endpoints. Onze hele dataset-toegang zit al in `prisma.$transaction(...)` (zie `withTenant` in `packages/db/src/index.ts`), wat in PgBouncer transaction-mode aan één backend-connection plakt voor de hele transactie. `SET LOCAL` overleeft dat.

### Negatief / trade-offs

- Twee secrets te beheren in plaats van één. Documentatieverplichting voor devops-qa (zie `docs/runbooks/`).
- Risico op verwarring: developer kopieert per ongeluk de directe URL als `DATABASE_URL`. Werkt wel maar slaat de pool over → connection-exhaustion bij load. Mitigatie: runbook documenteert dit expliciet.
- Risico op verwarring andersom: kopieert pooled URL als `DIRECT_URL` → migrations falen met onduidelijke advisory-lock-errors. Mitigatie: idem runbook, plus duidelijke error-message als `prisma migrate deploy` faalt zonder `DIRECT_URL` op een Neon-deploy.

### Neutraal

- `directUrl` is een Prisma-feature sinds 4.10, stabiel sinds 5.x. Geen preview-flag nodig.
- Heeft geen impact op `@prisma/client` bundle-grootte of generatie.

## Alternatieven overwogen

### Alternatief A: één URL (geen pooler)

- Overwogen: simpelste config, gewoon de directe Neon URL voor alles.
- Afgevallen: Neon directe endpoint heeft een **lage connection-cap** op het free/launch tier (~100 connections). Fastify met Prisma opent al snel 10–20 connections per instance; bij meerdere Fly machines exhaust je de pool. PgBouncer is nu juist het mechanisme dat dit voorkomt. Bovendien dwingt Neon connection-pooling af zodra je free tier verlaat.

### Alternatief B: één URL (alleen pooler)

- Overwogen: alle queries via pooler, migrations dus ook.
- Afgevallen: `prisma migrate deploy` faalt deterministisch op PgBouncer transaction-mode (advisory locks). Zelfs met `pgbouncer=true` query-param werkt migrate niet — die flag schakelt Prisma's prepared-statement cache uit voor runtime, niet de session-state-aannames van migrate.

### Alternatief C: aparte `PrismaClient` voor migrations

- Overwogen: in eigen code een tweede client met directe URL voor admin-taken.
- Afgevallen: `prisma migrate` is een CLI, geen library-call. Het kan niet "een tweede client" gebruiken; het leest zijn eigen datasource uit `schema.prisma`. `directUrl` ís de officiële Prisma-aanpak voor exact dit scenario.

### Alternatief D: pgbouncer in session-mode

- Overwogen: PgBouncer ondersteunt session-mode waarin advisory locks wel werken.
- Afgevallen: niet beschikbaar op Neon (Neon's pooler draait altijd transaction-mode). Zou betekenen: Neon pooler omzeilen en eigen PgBouncer hosten naast Fly. Dat is meer infra dan we nu willen toevoegen, en het lost niets op wat `directUrl` niet ook oplost.

### Alternatief E: data-proxy / Accelerate

- Overwogen: Prisma's eigen managed proxy doet pooling én caching.
- Afgevallen: extra third-party hop (data verlaat EU-regio richting Prisma's edge), kosten boven vrije tier, en lock-in op Prisma's hosted service. Past niet bij ons "boring tech in eigen regio" principe (ADR-0002).

## Vervolgactie

- [x] `packages/db/prisma/schema.prisma` aangepast: `directUrl = env("DIRECT_URL")` toegevoegd.
- [ ] `devops-qa` (`INFRA-0006`) — twee GitHub Actions secrets toevoegen aan `demo`-environment:
  - `NEON_DATABASE_URL` (pooled, met `?sslmode=require&pgbouncer=true&connect_timeout=10`)
  - `NEON_DIRECT_URL` (direct, met `?sslmode=require&connect_timeout=10`)
  
  In `deploy-demo.yml`:
  - **Pre-deploy step** ("Run migrations"): zet `DATABASE_URL=${{ secrets.NEON_DIRECT_URL }}` én `DIRECT_URL=${{ secrets.NEON_DIRECT_URL }}`, draai `pnpm --filter @hr-saas/db migrate:deploy`. Beide op direct want migrate gebruikt geen pool en heeft `directUrl` formeel nodig; gelijk zetten voorkomt dat een toekomstige seed-step per ongeluk via pooler praat.
  - **Fly secrets-set step**: `fly secrets set DATABASE_URL=${{ secrets.NEON_DATABASE_URL }} DIRECT_URL=${{ secrets.NEON_DIRECT_URL }} --app hr-saas-api-demo`. `DIRECT_URL` is op runtime niet strikt nodig, maar zetten we wel zodat ad-hoc `prisma db pull` of admin-tasks vanuit een Fly SSH-sessie kunnen werken.
- [ ] `devops-qa` — runbook `docs/runbooks/neon-connection-strings.md` schrijven met visueel onderscheid tussen pooled/direct URL en wanneer welke te gebruiken (voorkomt de twee verwarringsrisico's hierboven).
- [ ] `backend` — verifieer na eerste Neon-deploy dat een GET `/v1/employees` query effectief via de pooler gaat (Neon dashboard: "Connections" tab toont pooler vs direct connections).
- [ ] In een toekomstige sprint (AWS-migratie, ADR-0009): zelfde dual-URL pattern hergebruiken, alleen secrets vervangen door RDS Proxy + RDS direct endpoints. Geen schema-wijziging nodig.
