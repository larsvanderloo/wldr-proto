# Spec: Employees — CRUD + PII masking + audit log

- **ID**: FEAT-0001
- **Auteur**: pm
- **Datum**: 2026-04-21
- **Status**: done
- **Priority**: P0

## Samenvatting

De fundering van het HR SaaS: HR-admins, managers en medewerkers kunnen medewerker-records bekijken, aanmaken en bijwerken binnen hun eigen tenant. Gevoelige gegevens (BSN, IBAN) zijn standaard gemaskeerd en kunnen alleen door admins onthuld worden, met reden en audit log.

## Persona's

- **Primair**: HR-admin (beheert alle records)
- **Secundair**: Manager (bekijkt + update eigen reports), Employee (bekijkt eigen profiel)

## User stories

### US-1: HR-admin beheert medewerkers

**Als** een HR-admin **wil ik** medewerkers kunnen aanmaken, bewerken en verwijderen **zodat** mijn personeelsadministratie actueel blijft.

**Acceptatiecriteria**
- Given ik ben ingelogd als admin, when ik `/employees` bezoek, then zie ik een lijst van alle medewerkers binnen mijn tenant.
- Given ik ben ingelogd als admin, when ik een nieuwe medewerker aanmaak met geldige gegevens, then wordt deze opgeslagen, verschijnt in de lijst, en is een audit-event `employee.create` geschreven.
- Given een ongeldige BSN (11-proef faalt), when ik opsla, then krijg ik een field-level foutmelding en wordt niks opgeslagen.

**Inschatting**: L · **Priority**: P0

### US-2: PII is standaard gemaskeerd

**Als** elke gebruiker **wil ik** dat BSN en IBAN gemaskeerd zijn **zodat** ik niet per ongeluk gevoelige data lek tijdens screen-sharing.

**Acceptatiecriteria**
- Given ik bekijk een medewerker-detail, then zie ik BSN als `*****1234` en IBAN als `NL91 **** **** **67`.
- Given ik ben admin, when ik op "Onthul" klik en een reden invul, then wordt de plain waarde getoond en is een audit-event `employee.reveal_bsn` geschreven met mijn user-id en de reden.
- Given ik ben manager of employee, then zie ik de "Onthul"-knop niet.
- Given een PII-waarde is onthuld, then wordt deze na 30 seconden automatisch weer gemaskeerd in de UI.

**Inschatting**: M · **Priority**: P0

### US-3: Manager bekijkt eigen reports

**Als** een manager **wil ik** de details van mijn directe reports kunnen zien en basisvelden kunnen bijwerken **zodat** ik hun status actueel houd.

**Acceptatiecriteria**
- Given ik ben manager, when ik `/employees` bezoek, then zie ik alle medewerkers maar krijg ik 403 bij detail van iemand die niet mijn report is.
- Given ik ben manager, when ik `role` of `employmentStatus` probeer te wijzigen, then wordt de request afgewezen met 403.

**Inschatting**: S · **Priority**: P0

## Non-functional requirements

- Performance: lijst p95 < 300ms voor 10k rijen in de tenant.
- Security: BSN/IBAN kolom-level encrypted met pgcrypto; nooit in logs.
- Compliance: elke schrijfactie op `employees` schrijft `audit_events` in dezelfde transactie.
- Accessibility: WCAG 2.1 AA.
- i18n: nl-NL default, en-US fallback, alle labels via keys.

## Out of scope

- Authenticatie (separate story FEAT-0002).
- Bulk-import (FEAT-0009).
- Organogram-visualisatie (FEAT-0007).
- Audit-log-viewer voor admins (FEAT-0010).

## Dependencies

- `packages/contracts/` moet opgezet zijn (PLAT-0001).
- Prisma + RLS migraties gereed (INFRA-0002).

## Routing

- **architect**: ADR-0001 (stack), ADR-0002 (multi-tenancy), Zod-contracten in `packages/contracts/src/employees/`, Prisma-schema, RLS-migratie.
- **backend**: `apps/api/src/modules/employees/` — controller + service + repository + tests.
- **frontend**: `apps/web/app/pages/employees/` — list + detail + new, composables voor queries en mutations, `<MaskedField>`, `<Can>`.
- **devops-qa**: CI-pipeline, Testcontainers voor integration, tenant-isolatie-probe in E2E, release-checklist.

## Openstaande vragen

- Geen — alle blockers opgelost in planning.

## Definition of Done

- [x] Acceptatiecriteria geverifieerd met tests
- [x] Zod-contract in `packages/contracts/` gemerged
- [x] Migraties backward-compatible
- [x] Audit log aanwezig voor schrijfacties op PII
- [x] Role-gated UI waar relevant
- [x] i18n-keys aanwezig (nl-NL default)
- [x] E2E happy-path groen op staging
- [x] Feature-flag default OFF in prod
- [x] Release-rapport geschreven door devops-qa
