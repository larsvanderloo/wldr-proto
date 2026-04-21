# Runbook: Demo-deploy pipeline (Fly.io + Vercel + Neon)

- **Alert**: n.v.t. — dit is een setup- en operationeel runbook.
- **Pipeline**: `.github/workflows/deploy-demo.yml`
- **Eigenaar**: devops-qa
- **Bijgewerkt**: 2026-04-21
- **Gerelateerde ADR**: ADR-0004 (demo-hosting), ADR-0005 (Neon dual-URL)

---

## Overzicht

```
GitHub main → [migrate] → [deploy-api] parallel [deploy-web] → [smoke-test]
                 |               |                    |
              Neon DB        Fly.io ams           Vercel edge
         (prisma migrate)  (hr-saas-api-demo)  (app.larsvdloo.com)
```

Domeinen:
- Web: `app.larsvdloo.com` — CNAME naar Vercel
- API: `api.larsvdloo.com` — CNAME naar `hr-saas-api-demo.fly.dev`

DNS-provider: Vercel (domein `larsvdloo.com` staat in Vercel).

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
- `sslmode=require` — verplicht bij Neon, ook vanuit Fly.io.
- `pgbouncer=true` — schakelt Prisma's prepared statements uit (PgBouncer-compatibel).
- `connect_timeout=10` — voorkomt eindeloze verbindingspogingen bij cold-start.

### 1.2 Fly.io — API

```bash
# Installeer flyctl
brew install flyctl

# Maak account en log in
fly auth signup   # of: fly auth login (bij bestaand account)

# Verifieer login
fly auth whoami

# Maak de app aan (zonder te deployen — CI doet de eerste deploy)
# Voer dit uit vanuit de repo-root:
fly launch \
  --no-deploy \
  --config apps/api/fly.toml \
  --name hr-saas-api-demo \
  --region ams \
  --org personal

# Genereer een deploy-token (beperkt: alleen deploy, geen account-rechten)
fly tokens create deploy -a hr-saas-api-demo
# Kopieer de output — dit is FLY_API_TOKEN
```

**Controleer:** `fly status -a hr-saas-api-demo` toont de app als `suspended` (nog niet deployed).

### 1.3 Vercel — web

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

**Vercel project environment variables instellen** (via dashboard of CLI):

```bash
# Productie-omgevingsvariabelen op Vercel zetten:
vercel env add NUXT_PUBLIC_API_BASE production
# Waarde: https://api.larsvdloo.com

vercel env add NITRO_PRESET production
# Waarde: vercel
```

**Vercel token genereren:**
1. Ga naar [vercel.com/account/tokens](https://vercel.com/account/tokens).
2. Maak een token aan met naam `hr-saas-github-actions`.
3. Kopieer de token — dit is `VERCEL_TOKEN`.

**Optie B: GitHub-integratie**
Als je Vercel GitHub-integratie gebruikt (Vercel-app geinstalleerd op de repo), zijn
`vercel build` + `vercel deploy` in de workflow overbodig — Vercel triggert zelf.
In dat geval: verwijder de `deploy-web` job uit `deploy-demo.yml` en vertrouw op
de Vercel-integratie. Nadeel: minder controle over deploy-volgorde t.o.v. migrate.
Aanbeveling: gebruik de CLI-methode zodat `migrate` altijd vóór `deploy-web` klaar is.

### 1.4 PII-encryptiesleutel genereren

```bash
# Genereer een sterke 32-byte hex key. NOOIT de dev-key hergebruiken.
openssl rand -hex 32
# Kopieer de output — dit is PII_ENCRYPTION_KEY
```

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

gh secret set FLY_API_TOKEN
# Plak het Fly deploy-token

gh secret set VERCEL_TOKEN
# Plak het Vercel token

gh secret set VERCEL_ORG_ID
# Plak de orgId uit .vercel/project.json

gh secret set VERCEL_PROJECT_ID
# Plak de projectId uit .vercel/project.json
```

Verifieer:
```bash
gh secret list
# Verwacht: 7 secrets zichtbaar (namen, geen waarden)
```

### 1.6 DNS configureren (Vercel Dashboard)

DNS-provider is Vercel. Beide records worden aangemaakt in het Vercel-domeinbeheer
voor `larsvdloo.com`.

**Web — `app.larsvdloo.com`:**
1. Ga naar Vercel Dashboard → Project `hr-saas-web-demo` → Settings → Domains.
2. Voeg `app.larsvdloo.com` toe.
3. Vercel genereert automatisch een CNAME-record in het Vercel-DNS-panel
   (`larsvdloo.com` → beheerd door Vercel).
4. SSL-certificaat wordt automatisch uitgerold via Vercel's ACME-integratie.

**API — `api.larsvdloo.com`:**
1. Ga naar Vercel Dashboard → Domains (op account-niveau, niet project-niveau).
2. Voeg een DNS-record toe:
   - Type: `CNAME`
   - Naam: `api`
   - Waarde: `hr-saas-api-demo.fly.dev`
   - TTL: 3600 (of auto)
3. Fly.io verwerkt TLS voor dit domein via ACME (Let's Encrypt).
4. Voeg het custom domein toe aan Fly:
   ```bash
   fly certs add api.larsvdloo.com -a hr-saas-api-demo
   fly certs check api.larsvdloo.com -a hr-saas-api-demo
   # Wacht tot status: Issued
   ```

**Propagatietijd:** 5 minuten tot 48 uur, afhankelijk van DNS-cache. Vercel-DNS
propageert doorgaans binnen 5-15 minuten.

---

## 2. Eerste deploy

Na eenmalige setup: push naar `main` triggert de pipeline automatisch.

```bash
# Controleer of alle secrets gezet zijn
gh secret list

# Push (of maak een lege commit als main al up-to-date is)
git commit --allow-empty -m "chore(ci): trigger eerste demo-deploy"
git push origin main
```

**Stappen in de pipeline:**
1. `migrate` — Prisma migrate deploy via `NEON_DIRECT_URL`. Duurt ~30s.
2. `deploy-api` — Fly.io remote build + rolling deploy. Duurt ~3-5 min.
3. `deploy-web` — Vercel build + prod deploy. Duurt ~2-4 min. Parallel met deploy-api.
4. `smoke-test` — curl op beide endpoints. Duurt ~30s.

**Controleer na pipeline:**

```bash
# Neon-verbindingen
curl -sf https://hr-saas-api-demo.fly.dev/healthz
# Verwacht: {"status":"ok"}

# Via custom domein
curl -sf https://api.larsvdloo.com/healthz
# Verwacht: {"status":"ok"}

# Web
curl -sf -o /dev/null -w "%{http_code}" https://app.larsvdloo.com
# Verwacht: 200

# Fly machine-status
fly status -a hr-saas-api-demo
# Verwacht: 1 machine running, health check passing

# Neon connection count (via Neon dashboard)
# ga naar neon.tech → project → monitoring → connections
```

---

## 3. Troubleshooting

### 3.1 RLS werkt niet via pooler

**Symptoom:** Tenant-data lekt of queries returnen lege resultaten.

**Oorzaak:** PgBouncer in transaction-mode reset `SET LOCAL app.tenant_id` niet correct
als de sessie wordt hergebruikt. Prisma's `$executeRaw('SET LOCAL ...')` werkt alleen
in een transactie.

**Oplossing:** Zorg dat elke tenant-query in een `prisma.$transaction()` block zit.
Zie `packages/db/src/client.ts` voor het RLS-context-patroon. Als je buiten een
transactie werkt, gebruik dan de `NEON_DIRECT_URL` voor die query (development only).

### 3.2 Prisma migrate-fouten

**Symptoom:** Pipeline faalt op `prisma migrate deploy` met advisory lock error.

**Oorzaak:** `DATABASE_URL` in de migrate-step wijst per ongeluk naar de pooled URL.

**Oplossing:** Verifieer dat de `migrate`-job `NEON_DIRECT_URL` gebruikt voor zowel
`DATABASE_URL` als `DIRECT_URL`. De workflow zet beide correct — controleer of het
secret `NEON_DIRECT_URL` de directe URL (zonder `-pooler`) bevat.

**Symptoom:** `Migration file not found` of drift-detectie.

**Oplossing:**
```bash
# Bekijk migratiestatus
fly ssh console -a hr-saas-api-demo -C "cd /app && npx prisma migrate status"
# Of lokaal met DIRECT_URL:
DATABASE_URL=$NEON_DIRECT_URL DIRECT_URL=$NEON_DIRECT_URL pnpm --filter=@hr-saas/db migrate:deploy
```

### 3.3 Fly health check mislukt

**Symptoom:** Deploy slaagt maar health check in `/healthz` faalt. Machine crasht in loop.

**Diagnose:**
```bash
fly logs -a hr-saas-api-demo
fly status -a hr-saas-api-demo
```

**Veelvoorkomende oorzaken:**

| Oorzaak | Oplossing |
|---|---|
| `DATABASE_URL` secret niet gezet | `fly secrets list -a hr-saas-api-demo` — ontbrekende secrets toevoegen |
| App luistert niet op poort 4000 | Verifieer `PORT=4000` en `HOST=0.0.0.0` in `fly.toml` env |
| Prisma generate niet uitgevoerd in image | Controleer Dockerfile stage 3: `npx prisma generate` |
| Memory OOM (256 MB) | Verhoog tijdelijk: `fly scale memory 512 -a hr-saas-api-demo` |

### 3.4 Vercel build-cache stale

**Symptoom:** Wijzigingen in `packages/contracts` verschijnen niet in de web-build.

**Oplossing:**
```bash
# Forceer nieuwe build zonder cache
vercel --prod --force --token=$VERCEL_TOKEN
# Of via dashboard: Deployments → Redeploy → zonder cache
```

**Structurele oplossing:** Voeg een cache-key toe gebaseerd op `packages/contracts`
hash als dit vaker optreedt. Bespreek met devops-qa.

### 3.5 DNS-propagatie

**Symptoom:** `api.larsvdloo.com` of `app.larsvdloo.com` niet bereikbaar.

**Diagnose:**
```bash
# Check DNS-propagatie
dig CNAME api.larsvdloo.com +short
# Verwacht: hr-saas-api-demo.fly.dev

dig CNAME app.larsvdloo.com +short
# Verwacht: cname.vercel-dns.com of vergelijkbaar Vercel-target

# Alternatief: gebruik externe DNS-checker
curl "https://dns.google/resolve?name=api.larsvdloo.com&type=CNAME"
```

**Propagatietijd:** 5 minuten (Vercel-DNS) tot 48 uur (externe resolvers met hoge TTL).
Controleer TTL van bestaande records — verlaag naar 300s vóór wijzigingen.

**Fly TLS-certificaat:**
```bash
fly certs check api.larsvdloo.com -a hr-saas-api-demo
# Status moet "Issued" zijn; "Awaiting" = DNS propageert nog
```

---

## 4. Rollback

### 4.1 API-rollback (Fly.io)

```bash
# Bekijk release-history
fly releases -a hr-saas-api-demo

# Rollback naar vorige image
fly deploy --image <vorige-image-ref> -a hr-saas-api-demo
# image-ref staat in de output van fly releases, bv: registry.fly.io/hr-saas-api-demo:deployment-xyz
```

**Automatische rollback:** De workflow heeft geen automatische rollback (demo-fase).
Bij een falende health check in de `deploy-api` job stopt de pipeline; de vorige
machine draait nog. Fly's rolling-strategie zorgt dat de oude instantie actief blijft
totdat de nieuwe gezond is.

### 4.2 Web-rollback (Vercel)

1. Ga naar Vercel Dashboard → Project `hr-saas-web-demo` → Deployments.
2. Zoek de vorige succesvolle deployment.
3. Klik op `...` → **Promote to Production**.
4. Vercel routeert traffic onmiddellijk naar de vorige build.

### 4.3 Database-rollback (migraties)

**Belangrijk:** Prisma heeft geen ingebouwde rollback voor `migrate deploy`.
Migraties moeten backward-compatible zijn (expand-deploy-contract patroon — zie CLAUDE.md).

Bij een problematische migratie:
```bash
# Optie 1: nieuwe migratie die de wijziging ongedaan maakt
pnpm --filter=@hr-saas/db migrate:dev --name revert_<problematische_migratie>
# Schrijf de inverse SQL in de gegenereerde migratiebestand

# Optie 2: Neon branching (aanbevolen voor destructieve wijzigingen)
# Neon ondersteunt database-branches. Maak een branch vóór migrate:
# neon.tech → project → branches → Create branch
# Herstel data via de branch als de migratie data beschadigt.
```

**PITR (Point-in-Time Recovery):**
Neon Launch-plan ondersteunt 7 dagen PITR. Via Neon Dashboard → Restore.
Dit is een noodmaatregel — data na het herstelmoment gaat verloren.

---

## 5. Monitoring na deploy

Na elke deploy: monitor minimaal 15 minuten.

```bash
# Fly-logs streamen
fly logs -a hr-saas-api-demo

# Fly machine-status
watch -n 5 'fly status -a hr-saas-api-demo'

# API error-rate controleren
# (Datadog/Grafana: RED-dashboard per service)

# Neon connection pool-bezetting
# Neon Dashboard → Monitoring → Connections
# Grens: pooler max 100 verbindingen op free tier
```

**Wanneer escaleren:**
- API health check faalt na deploy: directe rollback (zie sectie 4).
- Error-rate boven 1% in 5 minuten: escaleer naar backend-eigenaar.
- Neon connections > 80% van max: schakel pooler-instellingen aan; bespreek met architect.
