# Runbook: Demo-deploy pipeline (Vercel + Neon)

- **Alert**: n.v.t. — dit is een setup- en operationeel runbook.
- **Pipeline**: `.github/workflows/deploy-demo.yml`
- **Eigenaar**: devops-qa
- **Bijgewerkt**: 2026-04-22
- **Gerelateerde ADR**: ADR-0004 (demo-hosting), ADR-0005 (Neon dual-URL)
- **Wijziging**: INFRA-0021 — Fly.io verwijderd; API draait nu als Nuxt Nitro server-routes op Vercel.

---

## Overzicht

```
GitHub main → [migrate] → [seed] → [vercel-env-sync] → [deploy-web] → [smoke-test] → [e2e]
                 |                          |                  |
              Neon DB               Vercel env API        Vercel edge
         (prisma migrate)       (JWT, DB creds, PII)   (app.larsvdloo.com)
                                                         incl. Nitro API
```

Domeinen:
- Web + API: `app.larsvdloo.com` — CNAME naar Vercel (Nuxt Nitro SSR + server-routes)

DNS-provider: Vercel (domein `larsvdloo.com` staat in Vercel).

**Architectuurwijziging INFRA-0021:** De Fastify-container op Fly.io is uit de pipeline verwijderd.
Alle API-logica draait nu als Nuxt Nitro server-routes op Vercel (`/api/v1/*`).
De smoke-test controleert `/api/v1/healthz` relatief via `app.larsvdloo.com`.
`api.larsvdloo.com` (CNAME naar Fly) blijft bestaan tot E2E groen is op de nieuwe stack
en INFRA-0022 de DNS-opruiming doet.

---

## 1. Eenmalige setup (voer dit eenmalig uit, in volgorde)

### 1.1 Neon — database

1. Ga naar [neon.tech](https://neon.tech) en maak een account aan.
2. Maak een nieuw project: naam `hr-saas-demo`, regio **EU Frankfurt (aws-eu-central-1)**.
3. Na aanmaken: ga naar **Connection Details**.
4. Selecteer **Pooled connection** en kopieer de URL. Dit is `NEON_DATABASE_URL`:
   ```
   postgresql://<user>:<pass>@<project>-pooler.eu-central-1.aws.neon.tech/neondb
   ?sslmode=require&pgbouncer=true&connect_timeout=10
   ```
   Let op: de pooler-host bevat `-pooler` in de hostnaam.

5. Selecteer **Direct connection** en kopieer de URL. Dit is `NEON_DIRECT_URL`:
   ```
   postgresql://<user>:<pass>@<project>.eu-central-1.aws.neon.tech/neondb
   ?sslmode=require&connect_timeout=10
   ```
   Let op: zonder `-pooler` in de hostnaam.

**Toelichting query-parameters:**
- `sslmode=require` — verplicht bij Neon.
- `pgbouncer=true` — schakelt Prisma's prepared statements uit (PgBouncer-compatibel).
- `connect_timeout=10` — voorkomt eindeloze verbindingspogingen bij cold-start.

### 1.2 Vercel — web + API (Nitro)

```bash
# Optie A: via CLI (aanbevolen voor eerste setup)
npm i -g vercel@latest
vercel login

# Navigeer naar de web-app map
cd apps/web

# Link het project aan Vercel (interactief)
vercel link
# Selecteer: create new project, naam: hr-saas-web-demo
# Na link: kopieer VERCEL_ORG_ID en VERCEL_PROJECT_ID uit .vercel/project.json

cat apps/web/.vercel/project.json
# {"orgId":"<VERCEL_ORG_ID>","projectId":"<VERCEL_PROJECT_ID>"}
```

**Vercel project environment variables instellen** (eenmalig via CLI of dashboard):

```bash
# Productie-omgevingsvariabelen op Vercel zetten:
vercel env add NUXT_PUBLIC_API_BASE production
# Waarde: /api/v1  (relatief — Nitro route, geen externe API-URL meer)

vercel env add NITRO_PRESET production
# Waarde: vercel
```

De overige vars (JWT_SECRET, COOKIE_SECRET, PII_ENCRYPTION_KEY, DATABASE_URL, DIRECT_URL)
worden automatisch gesynchroniseerd door de `vercel-env-sync` job bij elke pipeline-run.

**Vercel token genereren:**
1. Ga naar [vercel.com/account/tokens](https://vercel.com/account/tokens).
2. Maak een token aan met naam `hr-saas-github-actions`.
3. Kopieer de token — dit is `VERCEL_TOKEN`.

**Vercel team-ID ophalen:**
```bash
curl -s "https://api.vercel.com/v2/teams" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  | python3 -m json.tool | grep -E '"id"|"slug"'
# Kopieer het team-ID — dit is VERCEL_TEAM_ID
```

**Optie B: GitHub-integratie**
Als je Vercel GitHub-integratie gebruikt (Vercel-app geinstalleerd op de repo), zijn
`vercel build` + `vercel deploy` in de workflow overbodig — Vercel triggert zelf.
In dat geval: verwijder de `deploy-web` job uit `deploy-demo.yml` en vertrouw op
de Vercel-integratie. Nadeel: minder controle over deploy-volgorde t.o.v. migrate.
Aanbeveling: gebruik de CLI-methode zodat `migrate` altijd vóór `deploy-web` klaar is.

### 1.3 PII-encryptiesleutel genereren

```bash
# Genereer een sterke 32-byte hex key. NOOIT de dev-key hergebruiken.
openssl rand -hex 32
# Kopieer de output — dit is PII_ENCRYPTION_KEY
```

### 1.4 JWT- en session-secrets genereren

```bash
# Genereer JWT_SECRET
openssl rand -hex 32
# Genereer COOKIE_SECRET
openssl rand -hex 32
```

**Rotatie-beleid:** Roteer JWT_SECRET en COOKIE_SECRET door nieuwe waarden te genereren,
bij te werken in GitHub Secrets (`gh secret set JWT_SECRET`), en een lege commit te pushen
zodat de `vercel-env-sync` job de waarden doorzet naar Vercel. Actieve sessies worden
ongeldig bij rotatie — doe dit buiten kantooruren.

PII_ENCRYPTION_KEY mag NIET worden geroteerd zonder een datamigratieplan — bestaande
versleutelde velden in de DB worden onleesbaar. Rotatie is een architect-beslissing.

### 1.5 GitHub Secrets instellen

```bash
# Navigeer naar de repo
cd /path/to/wldr-proto

# Stel alle secrets in via gh CLI:
gh secret set NEON_DATABASE_URL
# Plak de pooled URL (met pgbouncer=true)

gh secret set NEON_DIRECT_URL
# Plak de directe URL (zonder pgbouncer)

gh secret set PII_ENCRYPTION_KEY
# Plak de 32-byte hex string

gh secret set JWT_SECRET
# Plak de 32-byte hex string

gh secret set COOKIE_SECRET
# Plak de 32-byte hex string

gh secret set VERCEL_TOKEN
# Plak het Vercel token

gh secret set VERCEL_ORG_ID
# Plak de orgId uit .vercel/project.json

gh secret set VERCEL_PROJECT_ID
# Plak de projectId uit .vercel/project.json

gh secret set VERCEL_TEAM_ID
# Plak het team-ID uit de Vercel API (zie sectie 1.2)
```

Verifieer:
```bash
gh secret list
# Verwacht: 9 secrets zichtbaar (namen, geen waarden)
# Let op: FLY_API_TOKEN is aanwezig maar deprecated (INFRA-0021) — laat staan.
```

### 1.6 DNS configureren (Vercel Dashboard)

DNS-provider is Vercel. Beide records worden aangemaakt in het Vercel-domeinbeheer
voor `larsvdloo.com`.

**Web + API — `app.larsvdloo.com`:**
1. Ga naar Vercel Dashboard → Project `hr-saas-web-demo` → Settings → Domains.
2. Voeg `app.larsvdloo.com` toe.
3. Vercel genereert automatisch een CNAME-record in het Vercel-DNS-panel.
4. SSL-certificaat wordt automatisch uitgerold via Vercel's ACME-integratie.

**Legacy API — `api.larsvdloo.com`:**
Dit CNAME-record (naar `hr-saas-api-demo.fly.dev`) blijft bestaan totdat INFRA-0022
is uitgevoerd. Raak het niet aan totdat E2E groen is op de nieuwe stack.

---

## 2. API draait nu via Nuxt Nitro op Vercel

Vanaf INFRA-0021 draait alle API-logica als Nitro server-routes binnen de Nuxt-app op Vercel.

**Wat dit betekent:**

| Oud (Fly.io) | Nieuw (Vercel Nitro) |
|---|---|
| `https://api.larsvdloo.com/healthz` | `https://app.larsvdloo.com/api/v1/healthz` |
| Aparte Fastify-container op Fly | Nuxt Nitro server-route in dezelfde Vercel-deployment |
| Fly secrets (JWT, DB, PII) | Vercel env-vars (gesynchroniseerd via `vercel-env-sync` job) |
| `CORS_ALLOWED_ORIGINS` nodig | Niet meer nodig — web en API op zelfde origin |

**Nitro server-routes:** Alle routes in `apps/web/server/api/` worden automatisch
geserveerd onder `/api/` door Nitro. De Vercel-preset compileert deze naar Vercel
serverless functions.

**Omgevingsvariabelen in Nitro:** Nitro leest env-vars uit Vercel's runtime environment.
De `vercel-env-sync` job zorgt dat de volgende vars altijd up-to-date zijn:
- `JWT_SECRET` — JWT signing
- `COOKIE_SECRET` — session cookie signing
- `PII_ENCRYPTION_KEY` — versleuteling PII-velden in DB
- `DATABASE_URL` — pooled Neon URL voor runtime queries
- `DIRECT_URL` — directe Neon URL voor transacties

**Lokale ontwikkeling:** Maak `apps/web/.env` aan met bovenstaande vars (dev-waarden).
Gebruik NOOIT productie-credentials lokaal.

---

## 3. Eerste deploy

Na eenmalige setup: push naar `main` triggert de pipeline automatisch.

```bash
# Controleer of alle secrets gezet zijn
gh secret list

# Push (of maak een lege commit als main al up-to-date is)
git commit --allow-empty -m "chore(ci): trigger eerste demo-deploy na INFRA-0021"
git push origin main
```

**Stappen in de pipeline:**
1. `migrate` — Prisma migrate deploy via `NEON_DIRECT_URL`. Duurt ~30s.
2. `seed` — Testdata seeden. Duurt ~20s.
3. `vercel-env-sync` — JWT/DB/PII env-vars naar Vercel pushen. Duurt ~15s.
4. `deploy-web` — Vercel build + prod deploy (Nitro = web + API). Duurt ~2-4 min.
5. `smoke-test` — curl op web en `/api/v1/healthz`. Duurt ~30s.
6. `e2e` — Playwright tests tegen `app.larsvdloo.com`. Duurt ~2-5 min.

**Controleer na pipeline:**

```bash
# Web
curl -sf -o /dev/null -w "%{http_code}" https://app.larsvdloo.com
# Verwacht: 200 of 3xx

# API via Nitro
curl -sf https://app.larsvdloo.com/api/v1/healthz
# Verwacht: {"status":"ok"}

# Neon connection count (via Neon dashboard)
# ga naar neon.tech → project → monitoring → connections
```

---

## 4. Troubleshooting

### 4.1 RLS werkt niet via pooler

**Symptoom:** Tenant-data lekt of queries returnen lege resultaten.

**Oorzaak:** PgBouncer in transaction-mode reset `SET LOCAL app.tenant_id` niet correct
als de sessie wordt hergebruikt. Prisma's `$executeRaw('SET LOCAL ...')` werkt alleen
in een transactie.

**Oplossing:** Zorg dat elke tenant-query in een `prisma.$transaction()` block zit.
Zie `packages/db/src/client.ts` voor het RLS-context-patroon.

### 4.2 Prisma migrate-fouten

**Symptoom:** Pipeline faalt op `prisma migrate deploy` met advisory lock error.

**Oorzaak:** `DATABASE_URL` in de migrate-step wijst per ongeluk naar de pooled URL.

**Oplossing:** Verifieer dat de `migrate`-job `NEON_DIRECT_URL` gebruikt voor zowel
`DATABASE_URL` als `DIRECT_URL`. De workflow zet beide correct — controleer of het
secret `NEON_DIRECT_URL` de directe URL (zonder `-pooler`) bevat.

**Symptoom:** `Migration file not found` of drift-detectie.

**Oplossing:**
```bash
# Lokaal controleren met DIRECT_URL:
DATABASE_URL=$NEON_DIRECT_URL DIRECT_URL=$NEON_DIRECT_URL pnpm --filter=@hr-saas/db migrate:deploy
```

### 4.3 Nitro serverless function crasht

**Symptoom:** `/api/v1/healthz` geeft 500 of time-out.

**Diagnose:**
1. Controleer Vercel Function logs: Vercel Dashboard → Project → Functions → logs.
2. Controleer of alle env-vars aanwezig zijn:

```bash
VERCEL_TOKEN='<token>'
TEAM='<team_id>'
PROJ='<project_id>'
curl -s "https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  | python3 -m json.tool | grep '"key"'
# Verwacht: JWT_SECRET, COOKIE_SECRET, PII_ENCRYPTION_KEY, DATABASE_URL, DIRECT_URL
```

**Veelvoorkomende oorzaken:**

| Oorzaak | Oplossing |
|---|---|
| Env-var ontbreekt op Vercel | Voer `vercel-env-sync` job handmatig uit (push lege commit) |
| `NITRO_PRESET` niet `vercel` | Vercel Dashboard → Environment Variables → check NITRO_PRESET |
| Prisma client niet gegenereerd | Controleer `postinstall` script in `package.json` van `@hr-saas/db` |
| Cold-start DB-timeout | Verhoog `connect_timeout` in Neon URL naar 30; overweeg connection pooling |

### 4.4 vercel-env-sync job mislukt

**Symptoom:** Job faalt met HTTP 4xx of onbekende fout.

**Diagnose:**
```bash
# Test Vercel API-toegang handmatig:
curl -s "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  | python3 -m json.tool | head -20
```

**Veelvoorkomende oorzaken:**

| Oorzaak | Oplossing |
|---|---|
| `VERCEL_TEAM_ID` niet gezet als GH secret | `gh secret set VERCEL_TEAM_ID` |
| Token verlopen | Genereer nieuw token op vercel.com/account/tokens |
| Project-ID onjuist | Controleer `.vercel/project.json` in `apps/web/` |

### 4.5 Vercel build-cache stale

**Symptoom:** Wijzigingen in `packages/contracts` verschijnen niet in de web-build.

**Oplossing:**
```bash
# Forceer nieuwe build zonder cache
vercel --prod --force --token=$VERCEL_TOKEN
# Of via dashboard: Deployments → Redeploy → zonder cache
```

### 4.6 DNS-propagatie

**Symptoom:** `app.larsvdloo.com` niet bereikbaar.

**Diagnose:**
```bash
dig CNAME app.larsvdloo.com +short
# Verwacht: cname.vercel-dns.com of vergelijkbaar Vercel-target

curl "https://dns.google/resolve?name=app.larsvdloo.com&type=CNAME"
```

**Propagatietijd:** 5 minuten (Vercel-DNS) tot 48 uur (externe resolvers met hoge TTL).

---

## 5. Rollback

### 5.1 Web-rollback (Vercel)

1. Ga naar Vercel Dashboard → Project `hr-saas-web-demo` → Deployments.
2. Zoek de vorige succesvolle deployment.
3. Klik op `...` → **Promote to Production**.
4. Vercel routeert traffic onmiddellijk naar de vorige build.

**Automatische rollback:** De workflow heeft geen automatische rollback (demo-fase).
Bij een falende health check stopt de pipeline. De vorige Vercel-deployment blijft
actief totdat je handmatig promoot.

### 5.2 Database-rollback (migraties)

**Belangrijk:** Prisma heeft geen ingebouwde rollback voor `migrate deploy`.
Migraties moeten backward-compatible zijn (expand-deploy-contract patroon — zie CLAUDE.md).

Bij een problematische migratie:
```bash
# Optie 1: nieuwe migratie die de wijziging ongedaan maakt
pnpm --filter=@hr-saas/db migrate:dev --name revert_<problematische_migratie>
# Schrijf de inverse SQL in het gegenereerde migratiebestand

# Optie 2: Neon branching (aanbevolen voor destructieve wijzigingen)
# neon.tech → project → branches → Create branch
# Herstel data via de branch als de migratie data beschadigt.
```

**PITR (Point-in-Time Recovery):**
Neon Launch-plan ondersteunt 7 dagen PITR. Via Neon Dashboard → Restore.
Dit is een noodmaatregel — data na het herstelmoment gaat verloren.

---

## 6. Monitoring na deploy

Na elke deploy: monitor minimaal 15 minuten.

```bash
# API via Nitro
watch -n 10 'curl -s https://app.larsvdloo.com/api/v1/healthz'

# Vercel Function logs (real-time)
vercel logs --prod --token=$VERCEL_TOKEN
# Of via Vercel Dashboard → Project → Functions

# Neon connection pool-bezetting
# Neon Dashboard → Monitoring → Connections
# Grens: pooler max 100 verbindingen op free tier
```

**Wanneer escaleren:**
- `/api/v1/healthz` faalt na deploy: directe rollback (zie sectie 5).
- Error-rate boven 1% in 5 minuten: escaleer naar backend-eigenaar.
- Neon connections > 80% van max: schakel pooler-instellingen aan; bespreek met architect.

---

## 7. Deprecated / ongebruikte GitHub secrets (INFRA-0021)

De volgende secrets zijn aanwezig in de repo maar worden niet meer gebruikt als
Fly.io-specifieke configuratie na INFRA-0021. Ze worden NIET verwijderd zodat een
rollback naar Fly.io mogelijk blijft totdat de pivot als stable is aangemerkt.
Opruiming is gepland in INFRA-0024.

| Secret | Status | Toelichting |
|---|---|---|
| `FLY_API_TOKEN` | Deprecated (rollback-behoud) | Was Fly.io deploy-token. Fly.io trial verlopen. Bewaard voor rollback. |
| `JWT_SECRET` | Actief op Vercel via vercel-env-sync | Was Fly.io secret. Wordt nu via `vercel-env-sync` job gesynchroniseerd naar Vercel. Blijft gezet in GH Secrets — dubbel gebruik is intentioneel tijdens transitie. |
| `COOKIE_SECRET` | Actief op Vercel via vercel-env-sync | Was Fly.io secret. Zelfde situatie als `JWT_SECRET`. Blijft gezet voor rollback-mogelijkheid. |
| `CORS_ALLOWED_ORIGINS` | Niet meer nodig | Was Fly secrets set. Web + API nu same-origin op Vercel — CORS niet meer relevant. |

**Rollback-procedure (Fly.io):**
Als de Vercel/Nitro-pivot mislukt en rollback naar Fly.io nodig is:
1. Herstel de `deploy-api` en `health-check API` jobs uit git-history (`git show <vorige-sha>:.github/workflows/deploy-demo.yml`).
2. `FLY_API_TOKEN`, `JWT_SECRET` en `COOKIE_SECRET` zijn nog aanwezig als GH secrets — geen herinstelling nodig.
3. Verwijder de `vercel-env-sync` dependency op `JWT_SECRET` en `COOKIE_SECRET` (die gaan dan weer via Fly).
4. Push naar `main` — pipeline hervat Fly-deploy.

**Opruiming (INFRA-0024):**
Verwijder `FLY_API_TOKEN` en `CORS_ALLOWED_ORIGINS` uit GH Secrets zodra:
- E2E groen op Vercel/Nitro-stack gedurende minimaal 2 sprints.
- INFRA-0022 (DNS-opruiming `api.larsvdloo.com`) is afgerond.
- Architect heeft bevestigd dat productie-pipeline (AWS ECS) geen Fly.io overlap heeft.

```bash
# Opruiming in INFRA-0024 (NIET nu uitvoeren):
gh secret delete FLY_API_TOKEN
gh secret delete CORS_ALLOWED_ORIGINS
# JWT_SECRET en COOKIE_SECRET blijven — die zijn actief op Vercel.
```
