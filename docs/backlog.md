# Backlog

> Geprioriteerde lijst. PM onderhoudt deze file en updatet status bij elke sprintplanning/close.
> **Status**: idea → ready → in-sprint → done

| ID | Titel | Priority | Status | Spec | Noot |
|---|---|---|---|---|---|
| INFRA-0003 | ESLint root-config aanmaken (flat config, ESLint 9, TS + Vue) | P0 | ready | — | CI-blokkade; `pnpm lint` faalt zonder dit; devops-qa + frontend |
| INFRA-0004 | Lokale omgeving runbook + README update (OrbStack) | P0 | ready | `docs/adr/0003-lokale-postgres-runtime.md` | devops-qa; ook Colima-fallback documenteren |
| INFRA-0005 | `deploy-demo.yml` GitHub Actions workflow voor Fly + Vercel | P0 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa; loopt parallel naast bestaande CI |
| INFRA-0006 | Neon-database provisioneren + migraties + env-secrets GitHub | P0 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa + backend; EU-regio (Frankfurt) verplicht |
| INFRA-0007 | Fly.io app provisioneren + Dockerfile valideren + fly.toml | P0 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa + backend; architect reviewt env-var-structuur |
| INFRA-0008 | DNS-setup Cloudflare + TLS-verificatie app/api subdomeinen | P0 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa; blocker voor publieke URL |
| INFRA-0009 | AWS-migratie vanuit demo-stack (toekomstige sprint) | P1 | idea | `docs/adr/0004-demo-hosting-tussenstap.md` | devops-qa; pas na eerste klant |
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
