# Spec: <feature-naam>

- **ID**: FEAT-NNNN
- **Auteur**: pm
- **Datum**: YYYY-MM-DD
- **Status**: draft | ready | in-sprint | done
- **Priority**: P0 | P1 | P2

## Samenvatting

Eén paragraaf: wat bouwen we en waarom.

## Persona's

- **Primair**: <HR-admin / manager / employee>
- **Secundair**: <...>

## User stories

### US-1: <titel>
**Als** een <persona>
**wil ik** <actie>
**zodat** <business-waarde>

**Acceptatiecriteria** (Gherkin)
- **Given** ..., **when** ..., **then** ...
- **Given** ..., **when** ..., **then** ...

**Inschatting**: S | M | L
**Priority**: P0 | P1 | P2

### US-2: ...

## Non-functional requirements

- Performance: <SLO>
- Security / privacy: <PII-velden, encryptie, audit-log-vereisten>
- Compliance: <GDPR / SOC 2 noten>
- Accessibility: WCAG 2.1 AA tenzij anders gemotiveerd
- i18n: nl-NL + en-US strings via `@nuxtjs/i18n`

## Out of scope

- ...

## Dependencies

- Feature / team / integratie dat eerst klaar moet zijn

## Routing

- `architect`: <wat>
- `backend`: <wat>
- `frontend`: <wat>
- `devops-qa`: <wat>

## Openstaande vragen

- ...

## Definition of Done

- [ ] Acceptatiecriteria geverifieerd met tests
- [ ] Zod-contract in `packages/contracts/` gemerged
- [ ] Migraties backward-compatible
- [ ] Audit log aanwezig voor schrijfacties op PII
- [ ] Role-gated UI waar relevant
- [ ] i18n-keys aanwezig (nl-NL default)
- [ ] E2E happy-path groen op staging
- [ ] Feature-flag default OFF in prod
- [ ] Release-rapport geschreven door devops-qa
