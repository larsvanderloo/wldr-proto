# ADR-0002: Multi-tenancy via shared schema + Postgres RLS

- **Status**: accepted
- **Datum**: 2026-04-21
- **Auteur**: architect
- **Reviewers**: backend, devops-qa

## Context

HR SaaS is multi-tenant. Elke tenant is een klantbedrijf. PII (BSN, IBAN, arbeidsvoorwaarden) moet strikt geïsoleerd blijven. Tegelijk willen we geen operationele last van 1000+ databases en willen we EU- en US-regio's separaat kunnen pinnen (GDPR).

## Besluit

**Shared schema** met `tenant_id` op elke rij-gebonden tabel + **Postgres Row-Level Security (RLS)** als belt-and-suspenders bovenop een tenant-scoped repository-laag in de app.

EU-tenants staan op een aparte RDS-instance in eu-west-1; US-tenants op us-east-1. Routing naar de juiste regio gebeurt op het auth-niveau (tenant → region lookup).

## Consequenties

### Positief
- Eén schema migreren in plaats van 1000.
- RLS vangt fouten in de repository-laag automatisch op — een "vergeten" `where tenant_id` resulteert in 0 rijen, niet in een datalek.
- Kolom-level encryptie (pgcrypto) voor BSN/IBAN bovenop RLS geeft diepte-verdediging.
- Data-residency via regio-specifieke instances is operationeel behapbaar.

### Negatief / trade-offs
- RLS policies moeten per migratie bijgewerkt worden als we tabellen toevoegen. DevOps-QA voegt een CI-check toe die faalt als een tabel geen RLS-policy heeft.
- Elke request moet `SET LOCAL app.tenant_id = '…'` uitvoeren bij het openen van de transactie. Dit zit in de `withTenant()` helper in `packages/db` — code buiten die helper komt niet bij employee-data.
- Cross-tenant analytics (bv "gemiddelde verloopduur over alle klanten") vereist een aparte, gecontroleerde bypass-rol. Voor nu out-of-scope.

### Neutraal
- Query-performance: `tenant_id` indexed op elke tabel, dus geen regressie.

## Alternatieven overwogen

### Database-per-tenant
- Overwogen: sterkste isolatie, eenvoudig regio's.
- Afgevallen: operationele kosten op 100+ tenants worden onhanteerbaar; schema-migraties vermenigvuldigen.

### Schema-per-tenant
- Overwogen: middenweg, tenant-switch via `SET search_path`.
- Afgevallen: Postgres-limieten op aantal schemas, complexe connection-pooling, Prisma-support zwak.

### Alleen app-layer tenant-scoping (geen RLS)
- Overwogen: eenvoudiger, geen DB-level complexiteit.
- Afgevallen: één bug in de repository-laag = lek. RLS is goedkope verzekering.

## Vervolgactie

- Prisma-schema heeft `tenant_id` op elke gedeelde tabel.
- Initial migratie zet RLS policies op `employees` en `audit_events`.
- CI-check toevoegen (devops-qa) die faalt op nieuwe tabel zonder RLS-policy.
- Tenant-isolatie-probe loopt bij elke deploy — als Tenant A iets van Tenant B kan zien, release NO-GO.
