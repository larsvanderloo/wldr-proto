# Release-checklist — v<X.Y.Z>

- **Release-manager**: devops-qa
- **Datum**: YYYY-MM-DD
- **Scope**: Sprint NN

## Pre-flight

- [ ] Alle PR's in deze release zijn gemerged en groen
- [ ] `scripts/ci-local.sh` groen op `main` HEAD
- [ ] Migraties in deze release zijn backward-compatible (expand-first)
- [ ] Geen migratie die langer dan 30s lock houdt op prod-data
- [ ] Feature-flags voor nieuw werk staan default OFF in prod
- [ ] Dashboards/alerts bestaan voor nieuwe endpoints
- [ ] Runbook aanwezig voor elke nieuwe alert
- [ ] PII-scan op nieuwe logs: geen onbedoelde PII
- [ ] Dependency-scan: geen nieuwe HIGH / CRITICAL CVE's
- [ ] Bundle-size check frontend: geen regressie > 10% op kritieke routes

## Contract & data

- [ ] OpenAPI in `docs/api/` up-to-date t.o.v. `packages/contracts/`
- [ ] Zod-schemas gebouwd en gepubliceerd als workspace-package
- [ ] Breaking API-changes gedocumenteerd in CHANGELOG

## Tenant & security

- [ ] Tenant-isolatie-probe groen tegen staging
- [ ] Audit-log entries aanwezig voor nieuwe schrijfacties op employees / compensation / documents / time-off / reviews
- [ ] Nieuwe endpoints hebben authz-checks (tests verifiëren 403 voor wrong-role)
- [ ] Rate-limits gezet op nieuwe auth- of bulk-endpoints

## E2E & performance

- [ ] Playwright suite groen op staging
- [ ] Kritieke synthetic monitors groen (login, employee-create, time-off-request)
- [ ] k6-run op top-10 endpoints: geen p95-regressie > 20%

## Deploy

- [ ] Release-notes opgesteld (NL) — `docs/sprints/SPRINT-NN/release.md`
- [ ] Changelog geüpdatet
- [ ] Tag gezet: `v<X.Y.Z>`
- [ ] Prod-deploy workflow gestart met approver
- [ ] Blue/green switch-moment gecommuniceerd
- [ ] Rollback-plan gedocumenteerd

## Post-deploy

- [ ] 30 minuten monitoring: error-rate, p95, queue-depth stabiel
- [ ] Smoke-tests tegen prod groen
- [ ] Stakeholder-communicatie verstuurd
- [ ] Support-team geïnformeerd over nieuwe features + bekende edge cases

## Go / No-go

**Besluit**: GO | NO-GO

**Onderbouwing**: ...

**Blockers bij NO-GO**: ...
