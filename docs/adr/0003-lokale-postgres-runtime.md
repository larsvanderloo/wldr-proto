# ADR-0003: Lokale Postgres-runtime voor ontwikkelomgeving

- **Status**: accepted
- **Datum**: 2026-04-21
- **Auteur**: pm (beslissing), ter formalisering door architect
- **Reviewers**: devops-qa, backend

## Context

De README vereist een lokale Postgres 16-instantie voor ontwikkeling en voor Testcontainers (integration-tests). Docker is niet geïnstalleerd op het eerste Mac-werkstation. Er zijn vier reële opties, elk met andere trade-offs op het gebied van licentierisico, onboarding-frictie en dev/prod parity.

Vereisten vanuit het project:

- Postgres 16 (zelfde major als productie RDS) — RLS-gedrag moet lokaal testbaar zijn.
- Testcontainers-compatibele Docker-daemon — `ci-local.sh` stap 7 draait integration-tests als Docker beschikbaar is.
- Geen licentierisico bij commercieel gebruik.
- Onboarding < 10 minuten voor een nieuw Mac-werkstation.

## Besluit

Wij kiezen **OrbStack** als standaard lokale container-runtime voor alle Mac-werkstations.

Installatie: `brew install orbstack`. OrbStack levert automatisch een Docker-compatibele daemon. Na installatie werkt `docker run postgres:16-alpine` en Testcontainers zonder verdere configuratie.

De README en `docs/runbooks/lokale-omgeving.md` worden bijgewerkt door devops-qa om deze keuze te reflecteren.

## Consequenties

### Positief

- Volledige Docker-daemon beschikbaar: dev/prod parity gewaarborgd inclusief RLS en Testcontainers.
- Mac-native VM (geen Linux-VM overhead zoals Docker Desktop); sneller en zuiniger op geheugen.
- Geen licentieverplichting — gratis voor alle gebruik, ook commercieel.
- Onboarding: één `brew install orbstack`, daarna werkt alles als Docker Desktop.
- OrbStack start automatisch mee op; geen handmatige daemon-start nodig.

### Negatief / trade-offs

- Niet cross-platform: Windows-werkstations vereisen een aparte afspraak (aanname: team werkt op macOS).
- OrbStack is een commercieel product — mocht het beleid wijzigen, is Colima de directe fallback zonder aanpassingen aan scripts of CI.
- CI/CD draait op GitHub Actions (Linux + Docker pre-installed) en wijzigt niet.

### Neutraal

- `ci-local.sh` stap 7 werkt nu altijd volledig op Mac (integration-tests worden niet meer overgeslagen).
- `.env.local` blijft `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hrdb_dev`.

## Alternatieven overwogen

### Docker Desktop
- Overwogen: meest bekende optie, brede documentatie.
- Afgevallen: commerciële licentie vereist bij organisaties met meer dan 250 medewerkers of meer dan 10 miljoen dollar omzet. Risico voor klanten die dit product evalueren op hun eigen infra.

### Colima (open-source)
- Overwogen: geen licentierisico, Docker-compat, CLI-only.
- Afgevallen: handmatige start (`colima start`), geen auto-start, hogere onboarding-frictie. Blijft de aanbevolen fallback als OrbStack onbeschibaar is.

### Native PostgreSQL via Homebrew
- Overwogen: geen container-overhead, eenvoudigste setup.
- Afgevallen: levert geen Docker-daemon — Testcontainers werkt niet, integration-tests worden structureel overgeslagen. Wijkt af van productie (RDS in container-context). Onacceptabel.

## Vervolgactie

- devops-qa: update `README.md` stap 4 naar OrbStack-instructie, voeg fallback-notitie toe voor Colima.
- devops-qa: schrijf `docs/runbooks/lokale-omgeving.md` met stapsgewijze setup (OrbStack + DB seed).
- devops-qa: verifieer dat `ci-local.sh` integration-tests volledig groen draaien na OrbStack-installatie.
