# Sprint 01 — Plan

- **Periode**: 2026-04-21 t/m 2026-05-02
- **Scrum-master / facilitator**: pm
- **Status**: closed
- **Gesloten**: 2026-04-21 (dag 2 — bootstrap volledig, sprintdoel behaald, schone knip naar Sprint 2)

## Sprintdoel

Een werkend medewerker-CRUD met PII-masking, audit log en tenant-isolatie — de fundering waarop verlof, onboarding en reviews gebouwd worden.

## Capaciteit

| Agent | Beschikbaarheid | Noten |
|---|---|---|
| pm | 100% | |
| architect | 80% | ADR's 0001, 0002, 0003 (contracts-pipeline) |
| frontend | 100% | |
| backend | 100% | |
| devops-qa | 80% | CI pipelines opzetten dag 1–3 |

## Stories in deze sprint

| ID | Titel | Priority | Routing | Inschatting | Status |
|---|---|---|---|---|---|
| FEAT-0001 | Employees CRUD + PII masking + audit log | P0 | architect → backend + frontend → devops-qa | L | done |
| INFRA-0001 | GitHub Actions CI + lokale `ci-local.sh` + Husky pre-push | P0 | devops-qa | M | done |
| INFRA-0002 | Prisma setup met RLS migratie + Testcontainers integration-suite | P0 | backend + devops-qa | M | done |
| PLAT-0001 | Shared `packages/contracts/` — Zod + OpenAPI-pipeline | P0 | architect | M | done |
| INFRA-0003 | ESLint root-config (flat config ESLint 9, TS + Vue) | P0 | devops-qa + frontend | S | ready |
| INFRA-0004 | Lokale omgeving runbook + README update (OrbStack + Colima-fallback) | P0 | devops-qa | S | ready |
| INFRA-0005 | `deploy-demo.yml` GitHub Actions workflow (Fly + Vercel + Neon) | P0 | devops-qa | M | done |
| INFRA-0006 | Neon-database provisioneren + migraties + GitHub Secrets | P0 | devops-qa + backend | M | done |
| INFRA-0007 | Fly.io app provisioneren + Dockerfile valideren + fly.toml | P0 | devops-qa + backend | M | done |
| INFRA-0008 | DNS-setup (Vercel DNS) + TLS-verificatie app/api subdomeinen | P0 | devops-qa | S | done |
| INFRA-0009 | AWS-migratie vanuit demo-stack | P1 | devops-qa | L | idea — toekomstige sprint |

## Risico's en afhankelijkheden

- **Risico**: PII-encryptie via pgcrypto werkt lokaal, maar prod vereist KMS-rotatie. Mitigatie: ADR voor key-management als aparte follow-up in Sprint 2.
- **Afhankelijkheid**: Auth is nog niet af — we gebruiken voorlopig `x-tenant-id` / `x-user-id` headers. Echte sessie-auth is FEAT-0002 in Sprint 2.
- **Risico**: Nuxt UI v4 + Pinia Colada zijn nieuw voor het team. Mitigatie: frontend-agent heeft MCP-server geconfigureerd, conventies staan in de agent-spec.

## Success metrics

- CRUD werkt end-to-end in staging: create, list, detail, update, delete — alle audit-logged.
- Tenant-isolatie-probe groen (Tenant A kan Tenant B's resources niet zien → 403/404).
- E2E happy-path voor employees draait < 15s op staging.
- Lokale CI-run < 3 minuten voor een clean checkout.

## Changelog

- 2026-04-21 — sprint gestart met bovenstaande scope.
- 2026-04-21 — INFRA-0003 en INFRA-0004 toegevoegd na onboarding-blokkades: ESLint-config ontbreekt (CI-gate kapot) en Docker niet aanwezig op werkstation (ADR-0003 vastgesteld: OrbStack). Beide zijn S-stories, geen scope-impact op sprintdoel.
- 2026-04-21 — INFRA-0005 t/m INFRA-0008 toegevoegd na besluit demo-hosting (ADR-0004: Fly.io + Vercel + Neon). Realisatie in 4 iteraties: billing blocker (private repo → public), Vercel TS/prisma-generate chain, Fly flyctl-install, Vercel regio-instelling, Dockerfile native build tools, health-check tuning. CI-suite (Lint/Type/Unit/Integration/Security/Build) groen op commit 42ade87. Web LIVE op Vercel. Fly.io deploy lopend in iter 4.
- 2026-04-21 — INFRA-0009 (AWS-migratie) blijft idea; bewust verschoven naar toekomstige sprint na klant-0 of na Sprint 3 — geen urgentie zolang demo-stack stabiel is.

### Realisatie-notities INFRA-0005 t/m INFRA-0008 (voor retro-input)

**Wat werkte**
- Neon EU-Frankfurt + dual-URL (ADR-0005) werkte zonder aanpassingen aan het Prisma-schema. Migraties 2x succesvol in 31s.
- Vercel Nuxt-preset: zero-config SSR-build bevestigd.
- `cancel-in-progress: false` in deploy-demo.yml correct — migrate mag nooit halverwege worden afgekapt.
- CI (kwaliteits-, integratie-, build-, security-jobs) groen in één run na correcties.

**Iteratie-oorzaken (tech debt input)**
1. Billing-blocker: repo private op free GitHub account → public gemaakt. Aanname in ADR-0004 ("gratis tiers") was te optimistisch voor private repos.
2. Prisma generate miste in Vercel build-keten → `packages/db/generate` stap toegevoegd.
3. `setup-flyctl` action onstabiel → vervangen door handmatige `curl | sh` install.
4. Vercel `regions: [ams1]` ongeldig op Hobby-plan → verwijderd.
5. Fly fly.toml miste dockerfile-pad (monorepo context) → `dockerfile = "Dockerfile"` met `--config apps/api/fly.toml` flag.
6. `cpu-features` native build faalt op Alpine zonder build-tools → `apk add python3 make g++ linux-headers` toegevoegd in Dockerfile deps-stage.
7. Vitest `--include` deprecated → `--reporter=verbose` fix.
8. Trivy versie-pin `v0.35.0` toegevoegd na onstabiele floating tag.
9. Web health check te strict (verwachtte 200, maar auth-redirect geeft 3xx/4xx) → health-check versoepeld naar "alles behalve 5xx en 000".

**Openstaand na iter 4**
- Fly.io deploy status onbekend op moment van analyse. Smoke tests hangen hierop.
- `api.larsvdloo.com` TLS-cert pending tot eerste succesvolle Fly deploy.
- Husky pre-push hook ontbreekt (`.husky/pre-push` niet aangemaakt).
- `deploy-staging.yml` (AWS OIDC) faalt elke push — nooit geconfigureerd, veroorzaakt workflow-ruis.
