# Sprint 01 — Plan

- **Periode**: 2026-04-21 t/m 2026-05-02
- **Scrum-master / facilitator**: pm
- **Status**: in-progress

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
