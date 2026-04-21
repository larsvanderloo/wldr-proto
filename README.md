# HR SaaS

Monorepo voor een multi-tenant HR SaaS-product, gebouwd door een team van vijf Claude Code-agents (pm, architect, frontend, backend, devops-qa). Werktaal: **Nederlands**. Code en tooling: Engels.

## Stack

- **Web** · Nuxt 4 + Vue 3 + TS strict + Nuxt UI v4 + Pinia + Pinia Colada
- **API** · Fastify + Prisma + PostgreSQL (RLS multi-tenancy) + BullMQ
- **Shared** · Zod-contracten in `packages/contracts/` (single source of truth)
- **Infra** · AWS (ECS Fargate, RDS, S3, CloudFront) via Terraform
- **CI/CD** · GitHub Actions + lokale mirror via `scripts/ci-local.sh`

## Snelstart

**Vereisten**: Node.js >= 20.11.0, pnpm >= 9.0.0, en **OrbStack** als lokale container-runtime.
Zie [docs/runbooks/lokale-omgeving.md](docs/runbooks/lokale-omgeving.md) voor installatie-instructies,
troubleshooting (poort 5432 bezet, container reset) en de Colima-fallback voor non-Mac.

```bash
# 0. OrbStack installeren (eenmalig — levert de Docker-daemon)
brew install orbstack
# OrbStack start automatisch; docker en docker compose werken direct.

# 1. Dependencies
pnpm install

# 2. Husky hooks installeren
pnpm prepare

# 3. Contracts bouwen (web + api importeren hieruit)
pnpm --filter=@hr-saas/contracts build

# 4. Database starten (via OrbStack/Docker)
docker run -d --name hrsaas-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=hrsaas -e POSTGRES_PASSWORD=hrsaas -e POSTGRES_DB=hrsaas \
  -p 5432:5432 postgres:16-alpine

# 5. Prisma migraties
export DATABASE_URL=postgresql://hrsaas:hrsaas@localhost:5432/hrsaas
export DIRECT_URL=postgresql://hrsaas:hrsaas@localhost:5432/hrsaas
export PII_ENCRYPTION_KEY=dev-only-pii-key-change-in-prod
pnpm --filter=@hr-saas/db migrate:dev

# 6. Dev-servers
pnpm dev                    # start web (:3000) + api (:4000) parallel
```

## Agents

De agents zitten in `.claude/agents/`. Ze zijn senior-niveau, werken zelfstandig, en communiceren in het Nederlands. Zie `CLAUDE.md` voor team-regels.

Slash-commands (`.claude/commands/`):

| Command | Wat het doet |
|---|---|
| `/feature <beschrijving>` | Nieuwe feature door volle pijplijn (pm → architect → builders → devops-qa) |
| `/sprint-start <nr> <doel>` | Nieuwe sprint openen met plan |
| `/standup <nr>` | Async dagelijkse standup aggregeren |
| `/sprint-close <nr>` | Sprint sluiten: review + rapport + retro + release |
| `/scaffold-resource <naam>` | Nieuwe resource end-to-end op de frontend |
| `/release-check` | Release-readiness gate |

## Nuxt UI MCP

Zet de Nuxt UI MCP-server op zodat de `frontend`-agent component-API's kan opzoeken in plaats van te raden:

```bash
claude mcp add --transport http nuxt-ui https://ui.nuxt.com/mcp
```

## Sprint-ritme

Tweewekelijkse sprints, alle documenten in `docs/sprints/SPRINT-NN/`.

Dag 1 → plan · dagelijks → standup · dag 5 → mid-sprint check · dag 10 → review + retro + release.

## Non-negotiables

- **Multi-tenancy** overal — elke tabel `tenant_id`, RLS aan, repository-laag scopet.
- **PII** kolom-level encrypted, gemaskeerd in UI, reveal is audit-logged.
- **Audit log** in dezelfde transactie als de schrijfactie op gevoelige entiteiten.
- **Migraties** altijd backward-compatible (expand → deploy → migrate data → contract).
- **Geen prod-hotfixes** — alles via PR en CI.
- **Lokale CI** (`scripts/ci-local.sh`) moet groen zijn vóór elke push (Husky afgedwongen).

## Documentatie

- `CLAUDE.md` — team playbook (agent-regels, sprint-ritme, conventies)
- `docs/specs/` — product-specs per feature
- `docs/adr/` — architectuurbeslissingen
- `docs/data-model/` — schema + ER-diagrammen
- `docs/api/` — OpenAPI (gegenereerd uit `packages/contracts/`)
- `docs/runbooks/` — operationele runbooks
- `docs/sprints/` — sprintdocumenten
- `docs/templates/` — templates voor alle documenttypen
