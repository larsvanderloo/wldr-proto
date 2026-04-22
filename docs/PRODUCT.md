# Product Overview — HR SaaS (wldr-proto)

> **Document type**: Product & Architecture Overview — outward-facing. English.
> **Audience**: Technical stakeholders, co-founders, investors, senior engineers evaluating the project.
> **As of**: April 22, 2026 — prototype phase, no paying customers.

---

## 1. What is this product?

This is a **multi-tenant HR SaaS** platform targeting Dutch SMB and mid-market companies (50–2,000 employees). It addresses a real gap in the market: HR platforms in this segment are either too bloated and expensive (Workday, SuccessFactors) or too shallow and non-compliant (spreadsheets, generic tools). The target buyer is the HR manager or people lead at a growth-stage company that has outgrown spreadsheets but does not need a full HRIS suite.

**Core problem solved**: HR teams waste significant time on manual employee data management, poor visibility into organizational structure, and error-prone paper-based processes for leave, onboarding, and performance cycles — all while struggling to stay compliant with Dutch labor law and GDPR.

**Positioning**: A product-led, compliance-first HR platform. Simple enough to deploy without an implementation partner; correct enough to pass a GDPR audit. Built API-first so it integrates with payroll providers (Nmbrs, AFAS, Exact) rather than competing with them.

**Primary personas**:

| Persona | Who they are | What they need |
|---|---|---|
| HR Admin | HR manager or office manager | Full CRUD on employee records, manage access, run reports |
| People Manager | Team lead or department head | View and update direct reports, approve leave requests |
| Employee | Any staff member | View own profile, submit leave, complete onboarding tasks |

---

## 2. Features: what exists today vs. what is planned

### Live today

| Feature | Description | Status |
|---|---|---|
| **Employee records (CRUD)** | Create, read, update, soft-delete employee profiles with full field set (name, job title, department, employment type/status, manager, start/end date) | Live — `app.larsvdloo.com` |
| **PII masking** | BSN and IBAN are column-level encrypted in Postgres (pgcrypto). The UI shows masked versions by default (`****1234`, `NL91 **** **** **67`). HR-admins can reveal with an explicit reason; the reveal is audit-logged and auto-masks after 30 seconds. | Live |
| **Audit log** | Every write action on sensitive entities (employees, users) is written to `audit_events` in the same transaction — actor, action, entity, timestamp, metadata. Non-repudiable. | Live |
| **Multi-tenant isolation** | Shared Postgres schema with `tenant_id` on every row-bound table, enforced by Postgres Row-Level Security (RLS). A bug in the application layer that forgets a `WHERE tenant_id = ?` clause returns zero rows — not a data leak. | Live |
| **Role-based access control** | Three roles: `hr_admin`, `manager`, `employee`. Enforced in the service layer, not only in the UI. Employees see only their own record; managers see direct reports; HR-admins see the full tenant. | Live (backend enforced) |
| **Authentication** | Email/password login with split-token session management (15-minute JWT in memory + 7-day opaque refresh token in httpOnly cookie). Tenant detection via email domain lookup. Bcrypt (rounds 12). Rate-limiting on login (Postgres-backed token buckets). | Functionally complete — being verified on production |
| **CI/CD pipeline** | GitHub Actions: lint, type-check, unit tests, integration tests (Testcontainers), security scan (Trivy), build — all must pass before deploy. Husky pre-push hook enforces the same checks locally. | Live |
| **Demo environment** | Vercel (Nuxt 4 SSR + Nitro server routes) + Neon Postgres (EU-Frankfurt). Single deployment, no CORS, one billing relationship. | Live — `app.larsvdloo.com` |

### In development now (Sprint 2.5, week of April 22)

The API is being migrated from a separate Fastify service (Fly.io, now expired) to Nitro server routes collocated with the Nuxt frontend on Vercel. This is an infrastructure change, not a feature change. Once done, the full auth flow is live without cross-origin complexity.

### Planned (next 3 months)

| Feature | ID | Priority | Notes |
|---|---|---|---|
| **Employee onboarding flow** | FEAT-0003 | P0 | Structured checklist-based onboarding for new hires. Sprint 3+. |
| **Leave management** | FEAT-0004 | P0 | Request, approve, track leave with manager-chain approval. Sprint 3+. |
| **Documents + e-signature** | FEAT-0005 | P1 | Upload, sign, store HR documents. Evaluate DocuSign vs HelloSign. |
| **Performance reviews** | FEAT-0006 | P1 | Quarterly review cycles. |
| **Org chart** | FEAT-0007 | P1 | Visual team hierarchy from `manager_id` data that already exists. |
| **Payroll integration** | FEAT-0008 | P1 | Via Finch or Merge.dev aggregator API. ADR needed. |
| **Bulk employee import** | FEAT-0009 | P2 | CSV upload via background job queue. Idempotent. |
| **Audit log viewer (UI)** | FEAT-0010 | P2 | Read-only interface on `audit_events` for HR-admins. |
| **EU/US data residency** | FEAT-0011 | P1 | Terraform-level routing. Blocker for EU enterprise customers. |
| **GDPR right to erasure** | FEAT-0012 | P1 | Hard-delete with cascade. Separate from soft-delete. |
| **SAML/SSO** | FEAT-0002b | P0 | Enterprise IdP integration (Okta, Azure AD, ADFS). Triggered by first enterprise deal. |
| **Password reset flow** | — | P1 | Not in Sprint 2. Sprint 3 or 4. |

---

## 3. Technical architecture

### Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Nuxt 4 · Vue 3 · TypeScript strict | SSR for fast first paint, file-based routing, auto-imports, i18n built-in (ADR-0001) |
| **UI components** | Nuxt UI v4 (125+ components on Reka UI + Tailwind CSS) | WCAG 2.1 AA baseline, semantic color tokens for future per-tenant theming |
| **Client state** | Pinia (UI state) + Pinia Colada (server state, SSR-aware) | Clean separation: no server data in Pinia stores, no duplicate caching |
| **API / server** | Nitro server routes (Nuxt's underlying engine) | Same-origin as frontend, no CORS, no cold-start overhead on Vercel (ADR-0007) |
| **Previous API** | Fastify 5 (archived, `apps/api/` — see ADR-0007) | Was the API runtime until Fly.io trial expired |
| **ORM** | Prisma 5 | Type-safe queries, migration tooling, dual-URL pattern for pooler/direct |
| **Database** | Postgres 16 (Neon EU-Frankfurt for demo; AWS RDS for production) | RLS support, pgcrypto for column-level encryption |
| **Type contracts** | Zod schemas in `packages/contracts/` | Single source of truth: same schema validates frontend forms and backend requests |
| **Testing** | Vitest (unit + integration) · Testcontainers · Playwright (E2E) | Full pyramid; integration tests run against real Postgres via Docker |
| **Infrastructure** | Vercel (demo) → AWS ECS Fargate + RDS + CloudFront (production path) | Demo-first approach, AWS migration planned post-customer-0 |

### Architecture overview

```
Browser / Nuxt SSR (Vercel)
  ↓ same-origin requests
Nitro server routes  (/api/v1/*)
  ↓ Prisma client (pooled URL → PgBouncer)
Neon Postgres EU-Frankfurt
  ├─ RLS: SET LOCAL app.tenant_id per transaction
  ├─ pgcrypto: BSN / IBAN encrypted at column level
  └─ audit_events: written in same transaction as every sensitive write
```

The frontend and API share one Vercel deployment. There is no CORS configuration. The Nuxt `$fetch` client on the server-side renders against the same Nitro runtime, which means SSR pages load authenticated data without a second network hop.

### Multi-tenancy

The approach is **shared schema + Postgres Row-Level Security** (ADR-0002):

- Every row-bound table has a `tenant_id` UUID column with an index.
- RLS policies are enabled on all tenant-scoped tables. A missing `WHERE tenant_id` clause in the application layer returns empty results — it cannot cross tenant boundaries.
- All queries run inside a `withTenant()` helper that opens a `prisma.$transaction()`, executes `SET LOCAL app.tenant_id = '<uuid>'` as the first statement, and runs the actual query. The `SET LOCAL` survives PgBouncer's transaction-mode pooler because the transaction stays pinned to one backend connection for its duration.
- EU tenants (data residency) are pinned to `eu-west-1`. The routing to the correct region happens at the auth level (tenant → region lookup). This is architected but the Terraform provisioning for dual-region is deferred until the first EU enterprise customer.

### Security model

| Concern | Implementation |
|---|---|
| **Authentication** | Split-token: 15-min JWT in memory + 7-day opaque refresh token in httpOnly cookie (ADR-0006) |
| **CSRF** | Double-submit pattern on `/auth/refresh` only. Other mutation endpoints use only `Authorization` header — no cookie, no CSRF exposure. |
| **PII at rest** | BSN and IBAN: `pgcrypto` column-level encryption. Key from env (`PII_ENCRYPTION_KEY`). |
| **PII in logs** | pino logger with structured `redact` paths: `password`, `bsn`, `iban`, `authorization`, `set-cookie`, and wildcards. |
| **Authorization** | Enforced in the service layer. Role check and tenant scope both happen before any data is read or written. UI gates are secondary. |
| **Rate-limiting** | Postgres-backed token buckets (`rate_limit_buckets` table). UPSERT algorithm is atomic and race-safe. Works across serverless invocations — unlike the in-memory bucket it replaced. |
| **Audit trail** | `audit_events` table. Written in the same DB transaction as the triggering action — cannot be skipped. |

---

## 4. Key decisions and trade-offs

Seven Architecture Decision Records (ADRs) document the major choices. The essential logic:

**ADR-0001 — Nuxt 4 + Nuxt UI v4 + Pinia Colada**
Chose a complete, opinionated Vue stack over React + shadcn/ui. The Nuxt ecosystem gives SSR, file-based routing, i18n, and auto-imports without custom plumbing. Nuxt UI v4 provides 125+ accessible components with a theming model that supports future per-tenant branding. Trade-off: Pinia Colada is newer than TanStack Query and has less community content.

**ADR-0002 — Shared schema + Postgres RLS**
One schema to migrate instead of 1,000. RLS is belt-and-suspenders on top of the application-layer tenant scope. An application bug returns zero rows, not a data leak. Trade-off: every new table needs an RLS policy; a CI check enforces this.

**ADR-0004 — Demo hosting on Vercel + Neon (skip AWS for now)**
Getting a demo live in one day versus one week. The AWS production stack (ECS, RDS, ALB, ACM, Route53, IAM OIDC) is the correct end state but requires a sprint of infrastructure work that has no customer-facing value today. Neon is vanilla Postgres — no lock-in, same RLS behavior, EU Frankfurt. Trade-off: one migration sprint needed before the first paying customer.

**ADR-0005 — Prisma dual-URL (pooled runtime, direct migrations)**
Neon's PgBouncer runs in transaction mode. `prisma migrate` uses advisory locks and session state — both broken by transaction-mode pooling. Solution: `DATABASE_URL` points to the pooler (runtime), `DIRECT_URL` points to the raw Postgres instance (migrations). One `PrismaClient`, two env vars. This pattern is identical to the future AWS setup (RDS Proxy + direct RDS endpoint).

**ADR-0006 — Split-token auth with httpOnly cookie**
Refresh tokens in httpOnly cookies are inaccessible to JavaScript, including XSS payloads. A stolen JS context only gets the 15-minute access token from memory. Full CSRF mitigations are scoped to the single `/auth/refresh` endpoint — not spread across all mutations. Trade-off: slightly more complex than localStorage, but dramatically better security posture for HR data.

**ADR-0007 — API migrated to Nitro server routes on Vercel**
Fly.io free trial expired. Rather than pay for a second hosting relationship, all API logic moved to Nitro server routes collocated with the Nuxt frontend on Vercel. This eliminates CORS entirely, makes the cookie domain story trivial (same-origin), and makes the rate-limiter work across serverless invocations (Postgres-backed). Trade-off: BullMQ (needed for future bulk-import jobs, FEAT-0009) cannot run on serverless — this will require a dedicated worker service or Vercel Cron when that feature ships.

---

## 5. Current state

### What is live

| Component | URL | Notes |
|---|---|---|
| Web app (SSR) | `https://app.larsvdloo.com` | Nuxt 4, Vercel, EU edge |
| API (server routes) | `https://app.larsvdloo.com/api/v1/*` | Nitro, same-origin, migrating Sprint 2.5 |
| Database | Neon Postgres, EU-Frankfurt | Pooled + direct URL, RLS active, migrations deployed |
| Auth | Login verified manually (`hr_admin@acme.test`) | JWT + httpOnly cookie, tenant-aware |

### What is in progress (Sprint 2.5, April 22–29)

The Fastify API that ran on Fly.io is being ported to Nitro server routes. Nine stories are in flight:

- Auth endpoints (login, refresh, logout, register) as Nitro handlers
- Employee CRUD endpoints as Nitro handlers
- Nitro middleware (request-id, security headers, auth-context, error handler)
- Postgres-backed rate limiter replacing the in-memory bucket
- CI/CD pipeline cleanup (Fly steps removed)
- Playwright E2E re-validated against new endpoints

### What is blocked / open

- `INFRA-0022` (DNS cleanup for `api.larsvdloo.com`) waits for E2E to go green
- `apps/api/` (Fastify archive) will be renamed after 7 days of green E2E on Nitro
- AWS migration (`INFRA-0009`) is explicitly deferred to post-customer-0

---

## 6. Phase and path to customer-0

**Current phase**: Prototype. No paying customers. No SLA. Single-developer equivalent output via an AI-agent team.

**What "demo-ready" means**: A real person can create an account, invite an employee, manage their record, and log out — with proper role-based access, PII masking, and an audit trail. This is achievable by end of Sprint 2.5 (April 29).

**Path to customer-0**:

| Milestone | What is needed | Est. timing |
|---|---|---|
| Auth live on production | Sprint 2.5 complete | April 29 |
| Onboarding flow | Sprint 3 (FEAT-0003) | Mid May |
| Leave management | Sprint 3–4 (FEAT-0004) | Late May |
| Password reset + MFA | Sprint 3 (P1) | May |
| Seed data cleaned from production | Before any real customer | Pre-customer-0 |
| AWS migration | Before SLA commitment | Post-customer-0 conversation |
| SAML/SSO | When first enterprise deal materializes | On demand |
| GDPR hard-delete | FEAT-0012 | Sprint 4–5 |

The product is intentionally minimalist at this stage. Every feature that ships must be compliance-correct (PII, audit log, RLS) from day one. It is easier to add features to a compliant foundation than to retrofit compliance onto a feature-rich product.

---

## 7. How we build it

### The team

This project is built entirely by a team of five Claude Code agents, each operating at senior level within their domain. The human acts as orchestrator and product owner. There is no human engineering staff.

| Agent | Role | Domain |
|---|---|---|
| `pm` | Senior Product Manager | Specs, backlog, sprint planning, stakeholder reports |
| `architect` | Principal Architect | Data model, API contracts, ADRs, cross-cutting concerns |
| `frontend` | Senior Frontend Engineer | `apps/web/` — Nuxt, Vue, Pinia, UI components |
| `backend` | Senior Backend Engineer | `apps/api/` and `packages/db/` — Prisma, Postgres, server logic |
| `devops-qa` | Senior DevOps + QA | CI/CD, infra, E2E tests, release gates |

Agents work autonomously within their domain. They push back on underspecified requirements, raise compliance flags, and refuse to ship without tests. They do not ask for permission for routine work.

### Sprint rhythm

Two-week sprints with a fixed cadence:

| Day | Ritual | Owner | Output |
|---|---|---|---|
| Day 1 | Sprint planning | PM | `docs/sprints/SPRINT-NN/plan.md` |
| Daily | Async standup | All agents | `docs/sprints/SPRINT-NN/standups/YYYY-MM-DD.md` |
| Day 5 | Mid-sprint check | PM + Architect | Scope adjustments logged in plan |
| Day 10 | Sprint review | PM | `review.md` — delivered vs planned, metrics |
| Day 10 | Retrospective | All agents | `retro.md` — what worked, what to improve |
| Day 10 | Release | DevOps-QA | `release.md` — tag, changelog, rollout |

Sprint 1 closed in 2 days (bootstrap was faster than expected). Sprint 2.5 is a one-week mini-sprint inserted to handle the Fly.io → Vercel migration. The team adjusts cadence to circumstances rather than ceremony for its own sake.

### Engineering standards (non-negotiables)

- **No prod hotfixes.** Everything via PR and CI.
- **Backwards-compatible migrations only.** Expand → deploy → migrate data → contract.
- **Audit log is non-optional.** Every write on employees, users, compensation, documents, or reviews writes to `audit_events` in the same transaction.
- **Authorization in the service layer.** Not only in the UI. Not only checked via RLS.
- **PII never in logs.** pino `redact` config is treated as a compliance artifact; changes require an ADR revision.
- **Local CI must pass before push.** Husky pre-push hook runs `scripts/ci-local.sh` — identical to GitHub Actions.

### Codebase structure

```
apps/
  web/                 # Nuxt 4 SSR — frontend + Nitro server routes (API)
  api/                 # Fastify — deprecated, reference only (see ADR-0007)
packages/
  contracts/           # Zod schemas — shared between frontend forms and server validation
  db/                  # Prisma schema + migrations
infra/                 # Terraform (AWS — not yet provisioned)
docs/
  specs/               # Feature specs (PM)
  adr/                 # Architecture Decision Records (7 so far)
  sprints/             # Sprint plans, standups, reviews, retros
  backlog.md           # Prioritized backlog — single source of truth
```

---

## 8. Compliance and data handling

| Area | Approach |
|---|---|
| **GDPR** | PII identified and encrypted at column level. Right-to-erasure (FEAT-0012) designed into the schema (`deleted_at` soft-delete + future hard-delete path). Audit trail on all PII-touching actions. |
| **Data residency** | EU tenants on EU-Frankfurt Neon (demo) / `eu-west-1` RDS (production). US tenants on separate instance. Routing at auth level. |
| **Multi-tenancy isolation** | Postgres RLS + application-layer tenant scope. Dual enforcement. |
| **Secrets management** | Fly secrets (deprecated), Vercel environment variables. Never in code or logs. JWT secret, PII encryption key, database URLs are all injected at runtime. |
| **Dependency security** | Trivy scan in every CI run. |

**Compliance flags that require architect sign-off before build**: any spec touching PII fields, cross-tenant queries, new encryption schemes, or data residency changes. This is enforced by the PM agent as part of the feature intake process.

---

*Last updated: April 22, 2026 — PM agent, wldr-proto.*
