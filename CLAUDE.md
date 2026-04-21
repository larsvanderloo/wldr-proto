# HR SaaS — Team Playbook

> **Working language: Nederlands.** Alle communicatie tussen agents, commits, PR-beschrijvingen, spec-documenten, ADR's, sprintrapporten en statusupdates zijn in het Nederlands. Code (variabelen, functies, types, tabelnamen) blijft in het Engels volgens industriestandaard. Gebruikersgerichte UI-strings gaan via i18n-keys (dag 1: `nl-NL` default, `en-US` fallback).

## Het team

Vijf senior agents. Elke agent werkt zelfstandig: leest context, maakt beslissingen binnen het eigen domein, levert af zonder onnodig terug te vragen. Overleg alleen bij echte kruispunten (data model, API contract, security, release).

| Agent | Rol | Model | Invoke wanneer |
|---|---|---|---|
| `pm` | Senior Product Manager | sonnet | Nieuwe feature, scoping, sprintplanning, backlog, rapportage |
| `architect` | Principal Architect | opus | Data model, API contract, ADR's, cross-cutting concerns |
| `frontend` | Senior Frontend Engineer | sonnet | Alles onder `apps/web/` |
| `backend` | Senior Backend Engineer | sonnet | Alles onder `apps/api/` en `packages/db/` |
| `devops-qa` | Senior DevOps + QA | sonnet | CI/CD, infra, E2E, release gates |

De hoofdthread van Claude is de **tech lead / orchestrator** — routeert werk, vat samen, checkt op kruispunten. Schrijft zelf geen productiecode.

## Sprintritme (2 weken)

We draaien tweewekelijkse sprints met een vaste cadans. Elke sprint heeft een map: `docs/sprints/SPRINT-NN/`.

| Dag | Ritueel | Eigenaar | Output |
|---|---|---|---|
| Dag 1 | **Sprintplanning** | `pm` | `docs/sprints/SPRINT-NN/plan.md` — doel, stories, capaciteit, routing |
| Dagelijks | **Standup (async)** | alle agents | `docs/sprints/SPRINT-NN/standups/YYYY-MM-DD.md` |
| Dag 5 | **Mid-sprint check** | `pm` + `architect` | Scope-aanpassing, vastgelegd in `plan.md` changelog |
| Dag 10 | **Sprint review** | `pm` | `docs/sprints/SPRINT-NN/review.md` — opgeleverd, demo, metrics |
| Dag 10 | **Retrospective** | alle agents | `docs/sprints/SPRINT-NN/retro.md` — goed / beter / acties |
| Dag 10 | **Release** | `devops-qa` | `docs/sprints/SPRINT-NN/release.md` — tag, changelog, rollout |

Alle sprintdocumenten volgen templates in `docs/templates/`.

## Standaard workflow voor een feature

1. `pm` schrijft `docs/specs/<feature>.md` — user stories, acceptatiecriteria, routing, definition of done.
2. `architect` reviewt → ADR (indien nodig) → datamodel-update → Zod contract in `packages/contracts/` → OpenAPI → build plan.
3. `backend` en `frontend` werken parallel tegen het contract. Backend levert migraties + endpoints eerst wanneer sequencing speelt.
4. `devops-qa` draait release-checklist, voegt E2E toe, tekent deploy af.

Senior-gedrag: agents pushen terug op onduidelijke specs, incomplete contracten of risicovolle beslissingen. Ze vragen niet om toestemming voor routinewerk binnen hun eigen domein.

## Repo-layout

```
apps/
  web/                 # Nuxt 4 + Nuxt UI v4 + Pinia + Pinia Colada — `frontend`
  api/                 # Fastify + Prisma — `backend`
packages/
  contracts/           # Zod schemas (single source of truth) + OpenAPI — gedeeld
  db/                  # Prisma schema + migraties — `backend`
infra/                 # Terraform — `devops-qa`
.github/workflows/     # CI/CD — `devops-qa`
docs/
  specs/               # `pm`
  adr/                 # `architect`
  data-model/          # `architect`
  api/                 # `architect`
  runbooks/            # `devops-qa`
  sprints/             # sprintdocumenten
  templates/           # spec / ADR / sprint / rapport templates
scripts/
  ci-local.sh          # lokale CI-run (identiek aan GitHub Actions)
```

## Stack

- **Web**: Nuxt 4 · Vue 3 · TS strict · Nuxt UI v4 · Pinia (UI state) · Pinia Colada (server state, SSR)
- **API**: Node.js · TS · Fastify · Prisma · Postgres (RLS multi-tenancy)
- **Shared**: Zod-contracts in `packages/contracts/` — gebruikt door `UForm` frontend en request-validatie backend
- **Infra**: AWS (ECS/Fargate, RDS, S3, CloudFront) · Terraform · GitHub Actions
- **Kwaliteit**: ESLint · TS strict · Vitest · Playwright · Husky + lint-staged

## Non-negotiables (voor iedereen)

- **Multi-tenancy**: elke tabel `tenant_id`; elke query scopet; Postgres RLS aan.
- **PII**: versleuteld at rest, gemaskeerd by default in UI, nooit in logs.
- **Audit log**: elke schrijfactie op employees / compensation / documents / time-off / reviews in dezelfde transactie.
- **Autorisatie**: gecheckt in de service-laag, nooit alleen in de UI.
- **Migraties**: altijd backward-compatible (expand → deploy → migrate data → contract).
- **Geen prod hotfixes**: alles via PR en CI.
- **Elke PR** draait `scripts/ci-local.sh` succesvol vóór push (Husky pre-push enforced).

## Handoff-etiquette

Een agent sluit werk altijd af met een statusblok in het Nederlands:

```
## Status
- **Gedaan**: <bullets>
- **Bestanden**: <paths>
- **Tests**: <pass/fail + counts>
- **Volgende**: <agent> — <reden>
- **Risico's / openstaand**: <lijst of "geen">
```

De orchestrator neemt deze blokken over in de dagelijkse standup.

## Conventional commits + PR-titels

Commits en PR-titels volgen [Conventional Commits](https://www.conventionalcommits.org/) in het Nederlands:

- `feat(employees): voeg bulk-import toe`
- `fix(auth): corrigeer sessieverversing bij tenant-switch`
- `chore(ci): upgrade actions/checkout naar v4`
- `docs(adr): ADR-0007 kiezen Fastify boven NestJS`

Scope is de package of het domein (`employees`, `time-off`, `web`, `api`, `infra`, `contracts`, `ci`).
