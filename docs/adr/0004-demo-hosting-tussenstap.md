# ADR-0004: Demo-hosting tussenstap — Fly.io + Vercel + Neon

- **Status**: accepted
- **Datum**: 2026-04-21
- **Auteur**: pm (beslissing), te reviewen door architect
- **Reviewers**: architect, devops-qa

## Context

Het prototype draait lokaal op OrbStack. Er zijn geen productieklanten, geen SLA, geen Terraform-infra. De eindstaat (ADR-0002, `deploy-prod.yml`) is AWS ECS Fargate + RDS + CloudFront. Die stack opbouwen kost minimaal een week aan IAM, VPC, ALB, ACM, Route53 en GitHub Actions OIDC-configuratie.

De vraag is: hoe krijgen we de demo zo snel mogelijk op een publieke URL met SSL, zonder de architectuurkeuzes voor de eindstaat te ondermijnen?

## Besluit

Wij kiezen voor een **tijdelijke demo-hosting** op drie managed platforms die daarna vervangen worden door AWS:

| Component | Platform | Regio |
|---|---|---|
| Web (Nuxt 4 SSR) | Vercel | edge / eu-west |
| API (Fastify, Docker) | Fly.io | eu-west (fra / ams) |
| Postgres | Neon | eu-west-1 (Frankfurt) |

DNS-provider: Cloudflare (gratis, universeel SSL-certificaat voor web-subdomein, directe TLS via ACME voor API-subdomein).

Subdomeinen:
- `app.<domein>` — Vercel CNAME, Cloudflare proxy aan (oranje wolkje, SSL via Cloudflare Universal Cert)
- `api.<domein>` — Fly.io IP, Cloudflare proxy UIT (grijs wolkje, TLS direct van Fly via ACME), anders interfereren Cloudflare-headers met Fly's health checks

Geschatte opzettijd: **minder dan een werkdag** na aanmaken accounts.

## Consequenties

### Positief
- Demo-URL met SSL binnen uren, niet weken.
- Fly.io draait Docker-containers: Fastify, Prisma migrate, healthcheck — identiek aan lokale stack.
- Neon ondersteunt `SET LOCAL app.tenant_id` in transacties: RLS-aanpak (ADR-0002) werkt zonder aanpassingen.
- Neon EU-regio (Frankfurt): voldoet aan GDPR data-residency voor demo-fase.
- Vercel Nuxt-preset: zero-config SSR-build, geen aanpassingen aan `nuxt.config.ts`.
- Gratis tiers dekken demo-fase ruimschoots (geen productieklanten, lage load).

### Negatief / trade-offs
- Er is een migratiemoment nodig wanneer AWS klaarstaat (schatting: 1 sprint devops-qa).
- Twee deployment-targets tegelijk onderhouden tot migratie is gedaan.
- Fly + Neon zijn niet onderdeel van de bestaande GitHub Actions pipeline (`deploy-prod.yml`). Er komt een aparte `deploy-demo.yml`.
- Neon free tier: 0.5 CU compute, 10 GB opslag — ruim genoeg voor demo maar niet voor load-tests.

### Neutraal
- Kostenimpact na gratis tier: Fly ~$5/mo (shared CPU), Neon ~$19/mo (Launch), Vercel gratis. Verwaarloosbaar voor MVP-fase.
- Geen blauw/groen deploys in demo-fase — simpele rolling restart op Fly is acceptabel zonder productieklanten.

## Alternatieven overwogen

### Alternatief A: Meteen AWS (eindstaat)
- Overwogen: architectureel zuiver, geen toekomstige migratie.
- Afgevallen: IAM-rollen, VPC, ALB, ACM-cert, ECS task definitions, Route53, GitHub Actions OIDC = minimaal een week werk. Demo kan niet wachten.

### Alternatief B: Railway (API + DB als monoblok)
- Overwogen: nog eenvoudiger dan Fly + Neon, één platform.
- Afgevallen: Railway Postgres zit op EU-regio's achter betaald plan. Neon heeft gratis EU. Bovendien: Fly geeft meer controle over Docker-specifics die de AWS-migratie later vergemakkelijken.

### Alternatief C: Render
- Overwogen: vergelijkbaar met Fly, goede Postgres-support.
- Afgevallen: Render free tier heeft cold-starts (>30s) op inactieve services. Fly heeft geen cold-starts bij shared-CPU instances.

### Alternatief D: Supabase (Postgres)
- Overwogen: managed Postgres met EU-regio.
- Afgevallen: Supabase heeft eigen Postgres-extensies en auth-opinionation die conflicteren met onze RLS-setup. Neon is een vanilla Postgres-managed service zonder opinionated extras.

## Vervolgactie

De stories die hieruit volgen zijn toegevoegd aan de backlog (INFRA-0005 t/m INFRA-0008):

- `INFRA-0005` — `deploy-demo.yml` GitHub Actions workflow (devops-qa) — P0
- `INFRA-0006` — Neon-database provisioneren + migraties draaien + env-secrets in GitHub (devops-qa + backend) — P0
- `INFRA-0007` — Fly.io app provisioneren + Dockerfile valideren + `fly.toml` (devops-qa + backend) — P0
- `INFRA-0008` — DNS-setup Cloudflare + TLS-verificatie `app.<domein>` en `api.<domein>` (devops-qa) — P0
- `INFRA-0009` — AWS-migratie vanuit demo-stack (toekomstige sprint, devops-qa) — P1

Architect dient te beoordelen of `INFRA-0005`–`INFRA-0008` impactvolle wijzigingen op de API-config vereisen (env-var-structuur, DATABASE_URL formaat Neon vs RDS).

## Addendum (2026-04-21, architect)

Na review: Neon vereist Prisma's dual-URL pattern (pooled runtime + directe migrations). Dit is uitgewerkt in **ADR-0005**. Het schema (`packages/db/prisma/schema.prisma`) is aangepast met `directUrl`. `INFRA-0005` en `INFRA-0006` moeten twee secrets registreren (`NEON_DATABASE_URL` pooled + `NEON_DIRECT_URL` direct) en `prisma migrate deploy` als pre-deploy step uitvoeren met de directe URL. Zie ADR-0005 sectie "Vervolgactie" voor de exacte secret-flow.
