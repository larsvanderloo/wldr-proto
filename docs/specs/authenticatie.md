# Spec: Authenticatie — email/wachtwoord + RBAC

- **ID**: FEAT-0002
- **Auteur**: pm
- **Datum**: 2026-04-22
- **Status**: ready
- **Priority**: P0

## Samenvatting

We bouwen een auth-laag op basis van email/wachtwoord + JWT-sessies, gekoppeld aan een basisrol-model (hr_admin / manager / employee) en tenant-isolatie via Postgres RLS. Dit vervangt de tijdelijke x-header-constructie uit Sprint 1 en maakt de applicatie veilig demobaar voor klant-0. SAML/SSO (enterprise IdP) is bewust buiten scope — dat volgt als FEAT-0002b zodra een enterprise-klant dat vereist.

## Persona's

- **Primair**: HR-admin — logt in, beheert medewerkers van de eigen tenant
- **Secundair**: Medewerker — logt in, ziet eigen record
- **Secundair**: Manager — logt in, ziet directe rapporten

## User stories

### US-1: Registratie van een nieuwe gebruiker
**Als** een HR-admin
**wil ik** een nieuw gebruikersaccount aanmaken met e-mailadres en wachtwoord
**zodat** de persoon kan inloggen in de applicatie van onze tenant

**Acceptatiecriteria** (Gherkin)
- **Given** een POST /auth/register met geldig e-mailadres en wachtwoord (min. 12 tekens), **when** de request binnenkomt, **then** retourneert de API 201 met `{ id, email, role }` zonder password_hash; gebruiker staat in de juiste tenant
- **Given** hetzelfde e-mailadres binnen dezelfde tenant, **when** POST /auth/register, **then** retourneert 409 Conflict
- **Given** een wachtwoord korter dan 12 tekens, **when** POST /auth/register, **then** retourneert 422 met Zod-validatiefout

**Inschatting**: M | **Priority**: P0

### US-2: Inloggen met e-mail en wachtwoord
**Als** een geregistreerde gebruiker
**wil ik** inloggen met mijn e-mailadres en wachtwoord
**zodat** ik toegang krijg tot de functies passend bij mijn rol

**Acceptatiecriteria** (Gherkin)
- **Given** correcte credentials, **when** POST /auth/login, **then** retourneert 200 met `{ access_token (JWT 15 min), refresh_token (7 dagen) }`; JWT-claims bevatten `sub`, `tenantId`, `role`
- **Given** onjuist wachtwoord, **when** POST /auth/login, **then** retourneert 401 met generieke melding (geen onderscheid e-mail vs. wachtwoord)
- **Given** credentials van tenant A in de context van tenant B, **when** POST /auth/login, **then** retourneert 401
- **Given** drie opeenvolgende mislukte pogingen binnen 5 minuten, **when** vierde poging, **then** retourneert 429 Too Many Requests

**Inschatting**: M | **Priority**: P0

### US-3: Sessie verlengen zonder opnieuw inloggen
**Als** een ingelogde gebruiker
**wil ik** dat mijn sessie automatisch verlengd wordt
**zodat** ik niet midden in mijn werk uitgelogd word

**Acceptatiecriteria** (Gherkin)
- **Given** een geldig refresh_token, **when** POST /auth/refresh, **then** retourneert nieuw access_token + nieuw refresh_token; het oude refresh_token is ongeldig (rotatie)
- **Given** een gebruikt of verlopen refresh_token, **when** POST /auth/refresh, **then** retourneert 401
- **Given** een verlopen access_token, **when** de frontend een API-call doet, **then** herhaalt de app de call transparant na een succesvolle refresh

**Inschatting**: S | **Priority**: P0

### US-4: Rol-gebaseerde toegang tot medewerkerdata
**Als** een medewerker
**wil ik** alleen mijn eigen data kunnen zien
**zodat** mijn privacy gewaarborgd is

**Als** een HR-admin
**wil ik** alle medewerkers van mijn tenant kunnen zien en bewerken
**zodat** ik HR-taken kan uitvoeren

**Acceptatiecriteria** (Gherkin)
- **Given** rol `employee`, **when** GET /employees, **then** retourneert alleen het eigen record
- **Given** rol `hr_admin`, **when** GET /employees, **then** retourneert alle medewerkers van de eigen tenant
- **Given** rol `manager`, **when** GET /employees, **then** retourneert directe rapporten + eigen record
- **Given** een verzoek op een employee-record van een andere tenant, **when** GET /employees/:id, **then** retourneert 404 (RLS, niet 403)

**Inschatting**: M | **Priority**: P0

### US-5: Inloggen via de browser
**Als** een gebruiker die de applicatie opent
**wil ik** een loginpagina zien
**zodat** ik direct kan inloggen zonder technische kennis

**Acceptatiecriteria** (Gherkin)
- **Given** een niet-ingelogde bezoeker op willekeurige URL, **when** de pagina laadt, **then** wordt geredirect naar /login?redirect=<original>
- **Given** correcte credentials in het loginformulier, **when** "Inloggen" wordt geklikt, **then** navigeert de app naar de oorspronkelijke URL (of /) en is de gebruiker ingelogd
- **Given** foutieve credentials, **when** "Inloggen" wordt geklikt, **then** toont de UI een foutmelding; wachtwoordveld geleegd; URL blijft /login
- **Given** browser-herstart met bestaande sessie, **when** de app laadt, **then** is de gebruiker nog steeds ingelogd via refresh-token herstel

**Inschatting**: M | **Priority**: P0

## Non-functional requirements

- **Performance**: Login-endpoint p99 < 200ms (bcrypt rounds 12 kost ~100ms — dat is acceptable en gewenst voor security)
- **Performance**: Sessie-middleware overhead < 5ms p95
- **Security / privacy**: Wachtwoorden alleen als bcrypt-hash (rounds 12) — nooit plaintext, nooit in logs. `password_hash` nooit in API-responses. JWT-secret via omgevingsvariabele (Fly secret), nooit in code of logs. Refresh-tokens als opaque random bytes (32 bytes, crypto.randomBytes), opgeslagen als hash in de database.
- **Security**: Rate-limiting op /auth/login en /auth/register (in-memory Sprint 2, Redis follow-up bij horizontale schaling)
- **Compliance**: Alle schrijfacties op `users`-tabel worden geaudit in `audit_events` (conform non-negotiables CLAUDE.md). `email` valt onder PII — versleuteld at rest conform bestaand PII-beleid.
- **Compliance**: GDPR: right-to-erasure (FEAT-0012) is een afhankelijke follow-up; users-tabel moet cascade-delete-paden ondersteunen
- **Accessibility**: Loginformulier voldoet aan WCAG 2.1 AA (label-koppeling, foutmeldingen via aria-live)
- **i18n**: Alle UI-strings via `@nuxtjs/i18n` — nl-NL default, en-US fallback. Foutmeldingen op formulier via i18n-keys.

## Out of scope

- SAML/SSO (FEAT-0002b — na klant-0 enterprise-deal)
- Magic link / passwordless login
- MFA / 2FA
- Social login (Google, Microsoft)
- Subdomain-gebaseerde tenant-routing (Sprint 3+)
- Wachtwoord-reset flow (P1, volgende sprint)
- Admin-paneel voor gebruikersbeheer (Sprint 3)
- Redis-backed rate-limiting (follow-up bij horizontale schaling)

## Dependencies

- FEAT-0001 (Employees CRUD) — done, `employees`-tabel bestaat al; `users.employee_id` foreign key nodig
- Architect ADR voor cookie-strategie (httpOnly-cookie vs Authorization-header) — blokkeert AUTH-0006 frontend-implementatie
- Fly.io secrets management voor JWT_SECRET en COOKIE_SECRET

## Routing

- `architect`: ADR auth-strategie, Zod-contract `packages/contracts/src/auth/`, schema-update `users`-tabel + `refresh_tokens`-tabel in Prisma, RLS-policies
- `backend`: AUTH-0001 t/m AUTH-0005, AUTH-0008 — migraties + endpoints + middleware + RBAC-checks
- `frontend`: AUTH-0006, AUTH-0007 — loginpagina, sessie-store (Pinia), auth-guard Nuxt middleware, useApi-composable uitbreiden
- `devops-qa`: AUTH-0009 — Playwright E2E, smoke-tests in deploy-pipeline, Fly secrets beheer, seed-data voor testomgeving

## Openstaande vragen

1. **Cookie-strategie**: httpOnly-cookie (CSRF-header nodig, werkt goed met Nuxt SSR) vs Authorization-header + localStorage (eenvoudiger maar XSS-risico). Architect beslissing — sprint-kritisch.
2. **Tenant-detectie bij login**: hoe weet het login-formulier welke tenant de gebruiker is? Sprint 2 aanname: tenant wordt bepaald via e-mail-domein lookup of handmatige tenant-slug invoer. Architect en pm beslissen vóór AUTH-0002 start.
3. **Seed-data E2E**: wie levert `prisma/seed.ts` met testgebruikers per rol? Aanname: backend als onderdeel van AUTH-0001.
4. **employee-user-koppeling**: is elke `user` ook een `employee`? Aanname: ja, `users.employee_id` is nullable (systeem-admins hebben geen employee-record). Architect valideert.

## Definition of Done

- [ ] Acceptatiecriteria geverifieerd met unit + integratietests (Vitest)
- [ ] Zod-contract in `packages/contracts/src/auth/` gemerged
- [ ] Migraties backward-compatible (users + refresh_tokens tabellen)
- [ ] Audit log aanwezig voor alle schrijfacties op `users`
- [ ] Role-gates actief op alle employee-endpoints
- [ ] Login-UI werkt op staging (`app.larsvdloo.com`)
- [ ] i18n-keys aanwezig voor alle foutmeldingen (nl-NL + en-US)
- [ ] Playwright E2E happy-path + unhappy-path groen in CI
- [ ] Geen x-tenant-id of x-user-id headers meer op productie-routes
- [ ] Auth-middleware overhead < 5ms p95 geverifieerd
- [ ] Architect heeft cookie-strategie ADR gemerged vóór frontend-start
- [ ] Feature-flag niet van toepassing (auth is een fundament, niet opt-in)
- [ ] Release-rapport geschreven door devops-qa
