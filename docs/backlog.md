# Backlog

> Geprioriteerde lijst. PM onderhoudt deze file en updatet status bij elke sprintplanning/close.
> **Status**: idea → ready → in-sprint → done

| ID | Titel | Priority | Status | Spec | Noot |
|---|---|---|---|---|---|
| INFRA-0003 | ESLint root-config aanmaken (flat config, ESLint 9, TS + Vue) | P0 | ready | — | CI-blokkade; `pnpm lint` faalt zonder dit; devops-qa + frontend |
| INFRA-0004 | Lokale omgeving runbook + README update (OrbStack) | P0 | ready | `docs/adr/0003-lokale-postgres-runtime.md` | devops-qa; ook Colima-fallback documenteren |
| INFRA-0005 | `deploy-demo.yml` GitHub Actions workflow voor Fly + Vercel | P0 | done | `docs/adr/0004-demo-hosting-tussenstap.md` | Geleverd Sprint 1 — 4 iteraties, CI-suite groen, web live |
| INFRA-0006 | Neon-database provisioneren + migraties + env-secrets GitHub | P0 | done | `docs/adr/0004-demo-hosting-tussenstap.md` | Geleverd Sprint 1 — EU-Frankfurt, dual-URL, 7 secrets, migraties 2x succesvol |
| INFRA-0007 | Fly.io app provisioneren + Dockerfile valideren + fly.toml | P0 | done | `docs/adr/0004-demo-hosting-tussenstap.md` | Geleverd Sprint 1 — Dockerfile multi-stage met build-tools, fly.toml rolling deploy, health check /healthz |
| INFRA-0008 | DNS-setup (Vercel DNS) + TLS-verificatie app/api subdomeinen | P0 | done | `docs/adr/0004-demo-hosting-tussenstap.md` | Geleverd Sprint 1 — CNAME api→fly.dev, wildcard ALIAS app/apex via Vercel; cert api.larsvdloo.com pending eerste deploy |
| INFRA-0009 | AWS-migratie vanuit demo-stack | P1 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa; pas na eerste klant of na Sprint 3 |
| INFRA-0010 | Husky pre-push hook implementeren (`ci-local.sh` afdwingen) | P1 | done | — | `.husky/pre-push` aangemaakt en executable; draait `bash scripts/ci-local.sh`; devops-qa Sprint 2 |
| INFRA-0011 | Node.js 20 → 24 migratie (actions + Dockerfile + engines) | P2 | done | — | `NODE_VERSION: '24.x'` in ci.yml, deploy-demo.yml, deploy-prod.yml; `engines.node >=24.0.0` root package.json; Dockerfile + api package.json engines bij backend |
| INFRA-0012 | Prisma OpenSSL-warning in Alpine Dockerfile verhelpen | P2 | done | — | `apk add --no-cache openssl` toegevoegd aan runtime-stage vóór CMD |
| INFRA-0013 | Testcontainers uit productie-image verwijderen | P1 | done | — | `testcontainers`/`supertest` stonden al als devDeps; native build-tools (`python3 make g++`) verwijderd uit deps-stage; `pnpm deploy --prod` sluit ze uit van runtime-image |
| INFRA-0014 | `deploy-staging.yml` (AWS OIDC) opruimen of verwijderen | P1 | done | — | Verwijderd; AWS-stack bestaat niet, OIDC niet geconfigureerd; AWS-deployment via nieuwe ADR + workflow bij INFRA-0009; devops-qa Sprint 2 |
| FEAT-0001 | Employees — CRUD + PII masking + audit log | P0 | done | `docs/specs/employees.md` | Seed-resource, geleverd in Sprint 1 |
| FEAT-0002 | Authenticatie — SSO (SAML) + email/password fallback | P0 | ready | tbd | Vereist voor SOC 2 traject |
| FEAT-0003 | Onboarding-flow voor nieuwe medewerkers | P0 | idea | tbd | Stagiair-variant ook |
| FEAT-0004 | Verlofaanvraag + goedkeuringsworkflow | P0 | idea | tbd | Integratie met organogram (manager-keten) |
| FEAT-0005 | Documenten + e-signature | P1 | idea | tbd | Evalueer DocuSign vs HelloSign |
| FEAT-0006 | Performance reviews (kwartaal) | P1 | idea | tbd | |
| FEAT-0007 | Organogram & team-overzicht | P1 | idea | tbd | |
| FEAT-0008 | Payroll-integratie via Finch/Merge | P1 | idea | tbd | ADR nodig voor keuze |
| FEAT-0009 | Bulk-import medewerkers (CSV) | P2 | idea | tbd | BullMQ-job, idempotent |
| FEAT-0010 | Audit log-viewer voor admins | P2 | idea | tbd | Read-only UI op audit_events |
| FEAT-0011 | Data-residency EU vs US (Terraform-modules) | P1 | idea | tbd | Blocker voor EU-klanten |
| FEAT-0012 | GDPR hard-delete (right-to-erasure) | P1 | idea | tbd | Apart van soft-delete |
