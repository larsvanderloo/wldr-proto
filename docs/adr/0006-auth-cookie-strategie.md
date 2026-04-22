# ADR-0006: Auth-strategie — split-token (JWT in memory + opaque refresh in httpOnly-cookie)

- **Status**: accepted
- **Datum**: 2026-04-22
- **Auteur**: architect
- **Reviewers**: pm, backend, frontend, devops-qa
- **Gerelateerd**: ADR-0002 (multi-tenancy via RLS), spec FEAT-0002, sprint SPRINT-02

## Context

Sprint 2 vervangt de tijdelijke `x-tenant-id`/`x-user-id`-headers uit Sprint 1 door een echte auth-laag. Het systeem is multi-tenant (één gedeeld schema, RLS via `current_setting('app.tenant_id')`), draait als Nuxt 4 SSR-frontend op Vercel en als Fastify-API op Fly.io (single-instance demo). De auth-keuzes raken vier dimensies tegelijk:

1. **Token-opslag op de browser** — XSS-risico (localStorage) vs CSRF-risico (cookies).
2. **Sessie-duur** — kort access-token vs lang refresh-token, en hoe we rotatie afdwingen.
3. **Tenant-detectie bij login** — gebruiker logt in op `app.larsvdloo.com` zonder subdomain; de API moet weten in welke tenant het email/wachtwoord-paar gevalideerd wordt.
4. **`users` ↔ `employees` koppeling** — hoort elke ingelogde gebruiker een employee-record te hebben, of mag een puur administratieve gebruiker zonder employee-record bestaan?

Spec FEAT-0002 markeert (1) en (3) expliciet als architectkeuzes. (2) is non-functional vereiste. (4) staat als open vraag op de spec, met aanname `nullable FK`. Sprint 2 vereist beslissingen op alle vier vóór backend en frontend kunnen starten.

Aanvullende randvoorwaarden:

- **Stack-aanname**: Nuxt 4 SSR fetcht via `useFetch`/`$fetch` zowel server-side (initial render) als client-side (na hydratie). Cookies gaan automatisch mee in de SSR-context als ze met `SameSite=Lax` op het API-domein gezet zijn.
- **Domein-topologie**: frontend op `app.larsvdloo.com`, API op `api.larsvdloo.com`. Beide zijn subdomains van `larsvdloo.com`. Cookies gezet door de API met `Domain=.larsvdloo.com` zijn lees-/zetbaar door beide sides.
- **Bestaande data**: `tenants`-tabel bestaat (slug, region) maar nog géén `email_domain`. `employees`-tabel bestaat met `email` + RLS.
- **Sprint 1 PII-decisie** (ADR-0002): PII wordt kolom-niveau versleuteld; `email` op `employees` is beleidsmatig PII. Voor `users.email` moeten we hetzelfde beleid bevestigen óf een uitzondering motiveren.

## Besluit

### 1. Token-opslag: split-token

- **Access-token**: JWT, 15 min TTL, payload `{ sub, tenantId, role, iat, exp }`, HS256 met `JWT_SECRET` (Fly secret). Frontend bewaart het JWT in **memory only** (Pinia store, niet gepersisteerd). Verstuurd via `Authorization: Bearer <token>` header op elke API-call.
- **Refresh-token**: opaque random `crypto.randomBytes(32).toString('hex')` (64 hex chars). Server slaat alleen `sha256`-hash op in `refresh_tokens.token_hash`. Verstuurd naar de browser als **httpOnly-cookie**:

  ```
  Set-Cookie: hr_refresh=<token>; HttpOnly; Secure; SameSite=Lax;
              Path=/v1/auth; Domain=.larsvdloo.com; Max-Age=604800
  ```

  - `Path=/v1/auth` beperkt scope tot login/refresh/logout — endpoint kan de cookie niet exfiltreren via een gewoon API-call.
  - `SameSite=Lax` blokkeert third-party CSRF op state-changing cross-site requests, behalve top-level GET — dat is acceptabel omdat refresh een POST is.
  - `Secure` verplicht HTTPS (geldt al productie + staging; lokaal werkt via Caddy/`localhost`-uitzondering in browsers).
  - `Domain=.larsvdloo.com` zodat `app.larsvdloo.com` de cookie meestuurt naar `api.larsvdloo.com`.

### 2. CSRF-mitigatie

`SameSite=Lax` dekt 95% af. Voor de overige 5% (subdomain takeover, oudere browsers, intentionele cross-subdomain trickery) gebruiken we **double-submit token** alleen op `/v1/auth/refresh`:

- Bij login zet de API naast `hr_refresh` een tweede cookie `hr_csrf=<random32hex>` met **dezelfde scope maar zónder `HttpOnly`**.
- De frontend leest `hr_csrf` JS-side en stuurt hem mee als `X-CSRF-Token`-header bij `POST /v1/auth/refresh`.
- API faalt met 401 als `cookies.hr_csrf !== headers['x-csrf-token']`.

Andere mutation-endpoints (`POST/PATCH/DELETE` op `/v1/employees`, etc.) hebben **géén** CSRF-check nodig — die routes lezen geen cookies, alleen `Authorization`-header. Een third-party site kan geen geldige `Authorization`-header zetten zonder eerst het JWT uit memory te stelen (XSS, niet CSRF).

### 3. Tenant-detectie bij login

**Primair: e-mail-domein lookup.** We voegen `tenants.email_domain TEXT UNIQUE` toe. Bij `POST /v1/auth/login`:

1. Server splits `email` op `@` → `domain`.
2. `SELECT id FROM tenants WHERE email_domain = $1` → `tenantId`.
3. `SET LOCAL app.tenant_id = '<tenantId>'`.
4. Lookup user op `(tenant_id, email)`, valideer wachtwoord, geef tokens terug.

Als `email_domain` niet matcht: 401 generic — geen onderscheid "tenant niet gevonden" vs "wachtwoord fout" (timing-leak prevention via constant-time bcrypt compare op een dummy hash).

**Secundair (escape hatch): expliciete tenant-slug.** Voor edge-cases (bv consultant met `@gmail.com` op tenant `acme`) accepteert `POST /v1/auth/login` een optioneel veld `tenantSlug` dat de domein-lookup overschrijft. UI exposeert dit veld pas na een mislukte login — niet by default — om friction laag te houden.

**Out of scope tot Sprint 3**: subdomain-routing (`acme.app.larsvdloo.com`). Vermeld in spec, niet hier.

### 4. `users` ↔ `employees` koppeling

- `users.employee_id` is **nullable** FK → `employees.id`.
- Service-laag enforced: gebruiker met `role = 'employee'` of `'manager'` MOET een `employee_id` hebben (constraint check in service-validatie + Zod-schema). Gebruiker met `role = 'hr_admin'` MAG een `employee_id` hebben (HR-medewerker die ook in HR-systeem zit) maar hoeft niet (puur administratieve account, externe consultant, demo-superuser).
- DB-niveau alleen FK + nullable; geen check-constraint op `(role, employee_id)` omdat de beslissing wie wat mag pure business-logic is en in service+contract hoort. Een verkeerde `INSERT` rechtstreeks in DB is hoe dan ook een breuk van de RLS-laag — niet de plaats om te bewaken.
- `ON DELETE` op de FK: `SET NULL`. Wanneer een employee verwijderd wordt (soft-delete in praktijk), blijft de user bestaan zodat audit-events traceerbaar blijven. Hard-delete via FEAT-0012 (GDPR right-to-erasure) handelt user-cascade apart af.

### 5. Bijkomende decisies

- **`users.email`-PII-beleid**: NIET kolom-versleuteld (afwijkend van `employees.email` per ADR-0002). Reden: login-flow heeft plaintext-lookup nodig op `(tenant_id, email)`, en versleutelen breekt indexering. We accepteren dit risico omdat: (a) de `users`-tabel alleen email + bcrypt-hash bevat (geen BSN/IBAN), (b) RLS dezelfde isolatie geeft als andere PII-tabellen, (c) audit-trigger logt elke mutatie. Documented hier als bewuste afwijking; volledige consequentie bij FEAT-0012.
- **Bcrypt rounds**: 12 (per FEAT-0002 NFR). ~100ms per login, acceptabel.
- **Rate-limiting**: in-memory token-bucket per `(ip, email)` op `/auth/login` en `/auth/register`. 3 fouten in 5 min → 429. Single-instance Fly is voorwaarde; horizontale schaling vereist Redis (follow-up, niet Sprint 2).
- **JWT-secret rotatie**: niet in scope Sprint 2. Voor demo één static secret. Roteren via `JWT_SECRET_PREVIOUS` (accept-old-sign-new) is FEAT-followup.
- **Logout**: `POST /v1/auth/logout` revoked refresh-token (`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`) en clear de twee cookies (`Set-Cookie: hr_refresh=; Max-Age=0` + idem `hr_csrf`). Access-token blijft tot expiry geldig — server-side blacklist is overkill voor 15-min TTL.

## Consequenties

### Positief

- **XSS-resistente refresh**: een gestolen JS-context kan geen 7-daagse sessie kapen — alleen het 15-min access-token uit memory. Schadebeperking is significant.
- **Werkt out-of-the-box met Nuxt SSR**: cookies gaan automatisch mee bij de SSR-fetch; frontend hoeft geen aparte hydratie-flow te bouwen voor refresh.
- **Server-side rotatie + revocatie**: refresh-tokens leven in DB, kunnen ingetrokken worden bij logout, password-change, of compromise. Stateless JWT alleen zou dit niet kunnen.
- **Tenant-detectie zonder UI-friction**: gebruiker typt alleen email; geen tenant-slug op het loginscherm — eerste indruk is een normaal SaaS-loginscherm.
- **Compatibel met bestaande RLS-architectuur** (ADR-0002): tenant_id komt uit JWT-claim na login → `SET LOCAL app.tenant_id` → bestaande policies werken zonder wijziging.

### Negatief / trade-offs

- **CSRF-mitigatie kost code**: één extra cookie + één extra header-check op `/v1/auth/refresh`. Bewust beperkt tot dat endpoint.
- **`users.email` plaintext** wijkt af van het algemene PII-beleid. Risico documenteerd, RLS+bcrypt mitigeert. Volledige plaintext-vrije login vereist deterministic encryption of separate lookup-table — disproportioneel voor Sprint 2.
- **`email_domain` migratie raakt bestaande tenants**: bestaande tenant-rijen hebben dit veld leeg. Migratie maakt veld `NULL`-able op DB-niveau; voor bestaande klanten/demo-tenants moet operationeel een waarde gezet worden vóór login werkt voor die tenant. In runbook documenteren.
- **`Domain=.larsvdloo.com` op de cookie** werkt alleen op het productie-domein. Lokaal (`localhost:3000` web ↔ `localhost:3001` api) gebruikt `same-origin` proxy of dev-cookie zonder `Domain` — backend leest `NODE_ENV` voor cookie-config.
- **Tenant-mismatch is niet getypeerd onderscheidbaar** in het 401-response (security-feature: timing/info-leak prevention). Kan support-debugging bemoeilijken; mitigatie via server-side log met `tenantId` (waar gevonden) + correlation-id.

### Neutraal

- Refresh-token in cookie + access-token in memory is **OWASP ASVS-aanbevolen patroon** — geen exotische keuze.
- `Path=/v1/auth` beperkt cookie-exposure; vereist dat álle auth-routes onder dit prefix vallen.
- Token-rotatie at every refresh genereert ~1 DB write per 15 min per ingelogde sessie. Acceptabel; index op `(tenantId, userId, revokedAt)` houdt cleanup goedkoop.

## Alternatieven overwogen

### Alternatief A: Authorization-header + localStorage voor refresh

- **Overwogen**: simpelste implementatie, geen CSRF-vraagstuk, geen cookie-domein-gedoe, eenvoudig op meerdere domains.
- **Afgevallen**: refresh-token in JS-toegankelijke storage betekent dat één XSS-bug 7 dagen sessie weggeeft. XSS-risico in een Nuxt-app is laag maar niet nul (third-party UI-libs, markdown-rendering in toekomstige features). De marginale extra complexiteit van httpOnly-cookies is een betere trade dan langdurige token-exposure. OWASP raadt het expliciet af voor langlevende tokens.

### Alternatief B: Beide tokens in httpOnly-cookies (geen `Authorization`-header)

- **Overwogen**: maximaal XSS-resistent, één opslagmechanisme, geen JS aanraking van tokens.
- **Afgevallen**: alle mutation-endpoints zouden CSRF-mitigatie nodig hebben (niet alleen `/auth/refresh`). Dat is een bredere oppervlakte voor fouten en breekt bij future native mobile clients (cookies werken anders dan web). Split-token houdt CSRF-mitigatie geconcentreerd op één endpoint.

### Alternatief C: Stateless JWT-only (geen refresh-token, lange TTL access-token)

- **Overwogen**: geen DB-state, simpel, snel.
- **Afgevallen**: 7-daagse JWT zonder revocatie betekent dat een gestolen token tot expiry bruikbaar is. Geen logout-mogelijkheid (anders dan client-side vergeten). Onacceptabel voor HR-data.

### Alternatief D: Tenant-detectie via subdomain (`acme.app.larsvdloo.com`)

- **Overwogen**: schoonste tenant-isolatie, geen email-domein-lookup nodig, makkelijke white-label.
- **Afgevallen voor Sprint 2**: wildcard-DNS + per-tenant TLS-cert + Vercel multi-domain config = significant extra werk dat niets aan de demo toevoegt. Spec vermeldt expliciet "Sprint 3+". Email-domein-lookup is functioneel equivalent voor MVP en kan later naast subdomain-routing leven.

### Alternatief E: Tenant-detectie via verplichte slug-input op loginscherm

- **Overwogen**: eenduidig, geen uniqueness-aanname op email_domain.
- **Afgevallen**: extra friction op loginscherm. Een gebruiker die "Bea van Acme" is moet ineens weten dat de slug "acme-corp" is. Email-domein-lookup is gebruikersvriendelijker; de slug-fallback (Besluit §3, secundair) dekt edge-cases.

### Alternatief F: WorkOS / Auth0 hosted-auth provider (per global default)

- **Overwogen**: industriestandaard, SSO/SAML klaar uit de doos, MFA/audit gratis.
- **Afgevallen voor Sprint 2**: spec scope is email/wachtwoord, geen SSO. Hosted-provider toevoegen voor alleen email/wachtwoord is overkill, voegt vendor-lock-in toe en kost ten minste een extra sprint aan integratie + per-tenant config. SAML/SSO komt terug bij FEAT-0002b — daar is het hosted-provider-besluit waarschijnlijk wel ja, en wordt dan herzien in een nieuwe ADR die dit besluit superseden kan.

## Vervolgactie

- AUTH-0001 (backend): migratie + Prisma-schema voor `users` + `refresh_tokens` + `tenants.email_domain`-kolom.
- AUTH-0002 (backend): `/v1/auth/login` met email-domein-lookup → tenant_id → bcrypt-compare → JWT + refresh-cookie + csrf-cookie.
- AUTH-0003 (backend): `/v1/auth/refresh` met double-submit CSRF check + token-rotatie.
- AUTH-0004 (backend): Fastify-plugin `auth-context` die JWT valideert, `request.user = { id, tenantId, role }` zet, en `SET LOCAL app.tenant_id` afdwingt.
- AUTH-0006 (frontend): Pinia auth-store met JWT in memory; `useApi` zet `Authorization`-header automatisch; `/login`-pagina leest geen tenant-slug by default.
- AUTH-0007 (frontend): Nuxt route-middleware leest auth-store; bij missing/expired access-token roept `/auth/refresh` (cookies gaan automatisch mee).
- Runbook (`devops-qa`): operationele stappen voor `email_domain` op nieuwe tenants + JWT_SECRET-rotatie procedure.
- Toekomst (FEAT-0012): user-cascade bij employee hard-delete; refresh-token cleanup-job (cron) wanneer Sprint 2's "lazy cleanup at refresh-call" niet meer voldoet.

## Addendum 2026-04-22 — cookie-scope same-origin (Sprint 2.5, ADR-0007 V4)

**Wijziging**: `Domain=.larsvdloo.com` op `hr_refresh` en `hr_csrf` cookies vervalt. `Path` wijzigt van `/v1/auth` naar `/api/v1/auth`.

**Reden**: ADR-0007 migreert de API naar Nitro server routes onder dezelfde origin als de frontend (`app.larsvdloo.com`). De `Domain`-attribuut was nodig voor cross-origin cookie-deling tussen `app.larsvdloo.com` en `api.larsvdloo.com`. Bij same-origin is het overbodig en zelfs onveiliger: een `Domain=.larsvdloo.com` cookie lekt naar willekeurige andere subdomains (`marketing.larsvdloo.com`, `staging.larsvdloo.com`, etc.). Default-behavior (geen `Domain`) bindt de cookie aan exact `app.larsvdloo.com`.

**Nieuwe Set-Cookie-shape** (vervangt het voorbeeld in §1):

```
Set-Cookie: hr_refresh=<token>; HttpOnly; Secure; SameSite=Lax;
            Path=/api/v1/auth; Max-Age=604800
Set-Cookie: hr_csrf=<token>; Secure; SameSite=Lax;
            Path=/api/v1/auth; Max-Age=604800
```

**Wat blijft**:

- `HttpOnly` op `hr_refresh`, geen `HttpOnly` op `hr_csrf` (frontend leest deze JS-side voor de `X-CSRF-Token`-header).
- `Secure` in productie; weglaten lokaal (`NODE_ENV !== 'production'`).
- `SameSite=Lax` ongewijzigd — same-origin maakt CSRF nóg minder relevant maar de double-submit check blijft als belt-and-suspenders.
- Alle CSRF-mitigatie uit §2 ongewijzigd.

**Migratie-impact**:

- Bestaande sessies (op productie) waarbij de cookie met `Domain=.larsvdloo.com` is gezet, blijven werken tot de browser ze verloopt (max-age 7d) of de gebruiker uitlogt — de browser stuurt beide varianten mee bij requests naar `app.larsvdloo.com`. Geen forced logout nodig.
- Lokale dev: geen wijziging, `NODE_ENV !== 'production'` zette `Domain` al niet.
- `cookieDomain()`-helper in `apps/api/src/modules/auth/controller.ts` is overbodig in de Nitro-versie en wordt niet overgenomen in `apps/web/server/utils/cookies.ts`.

**Status**: dit addendum vervangt §1 cookie-shape en §"`Domain=.larsvdloo.com`"-bullet onder Negatief / trade-offs. De rest van ADR-0006 (split-token, CSRF double-submit, tenant-detectie, users↔employees) blijft onveranderd geldig.
