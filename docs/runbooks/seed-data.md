# Runbook: Seed-data

- **Eigenaar**: devops-qa
- **Laatste update**: 2026-04-21
- **Gerelateerd**: FEAT-0002, `packages/db/prisma/seed.ts`, ADR-0006

## Samenvatting

Dit runbook beschrijft hoe de seed-data voor de `acme`-testtenant wordt aangemaakt:
lokaal voor ontwikkeling, en tegen de Neon-staging-database voor E2E-tests en demo-gebruik.
Het seed-script maakt een tenant aan met drie gebruikersrollen, zodat alle auth-flows (hr_admin /
manager / employee) testbaar zijn.

---

## Vereisten

- `pnpm` geinstalleerd (zie `docs/runbooks/lokale-omgeving.md`)
- Lokaal: Postgres draait (Docker of native), `.env` gevuld
- Neon: toegang tot het Neon-project (vraag database-URL op bij teamlead)
- `DIRECT_URL` gezet — seeding werkt NIET via PgBouncer-pooler (advisory locks, zie ADR-0005)

---

## Wat het seed-script aanmaakt

Het script (`packages/db/prisma/seed.ts`) is idempotent via `upsert` op `(tenant_id, email)`.
Meerdere runs zijn veilig.

### Tenant

| Veld         | Waarde          |
|--------------|-----------------|
| `name`       | `Acme B.V.`     |
| `slug`       | `acme`          |
| `emailDomain`| `acme.test`     |
| `region`     | `eu-west-1`     |

### Gebruikers en rollen

Wachtwoord voor alle testgebruikers: `Welkom01!Welkom` (bcrypt, rounds 12)

| Email                   | Rol        | Employee-record |
|-------------------------|------------|-----------------|
| `admin@acme.test`       | `hr_admin` | Nee (nullable)  |
| `manager@acme.test`     | `manager`  | Ja              |
| `medewerker@acme.test`  | `employee` | Ja              |

De `manager`-user is gekoppeld aan de `manager`-employee, de `employee`-user aan de
`medewerker`-employee. De `hr_admin` heeft geen `employee_id` (conform ADR-0006 § 4).

---

## Lokaal seeden

```bash
# 1. Zorg dat de lokale Postgres draait en migraties zijn uitgevoerd.
pnpm --filter=@hr-saas/db migrate:dev

# 2. Seed draaien.
pnpm --filter=@hr-saas/db db:seed
```

Verwachte output:
```
Seeding...
Tenant acme aangemaakt/bijgewerkt
Employee-records aangemaakt/bijgewerkt
Users aangemaakt/bijgewerkt
Klaar.
```

Bij fout `Cannot find module '@hr-saas/db'`: run eerst `pnpm --filter="./packages/*" build`.

---

## Tegen Neon (staging) seeden

Gebruik ALTIJD de directe Neon-URL, nooit de pooled URL.

```bash
# Exporteer de directe Neon URL (haal op uit Fly secrets of Neon dashboard)
export DATABASE_URL="postgresql://user:pass@<project>.eu-central-1.aws.neon.tech/neondb?sslmode=require"
export DIRECT_URL="$DATABASE_URL"

# Seed draaien (vanuit repo-root)
pnpm --filter=@hr-saas/db db:seed
```

Na de seed: verifieer in Neon dat de `acme`-tenant aanwezig is.

```sql
SELECT slug, email_domain FROM tenants WHERE slug = 'acme';
SELECT email, role FROM users WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'acme');
```

Verwacht: 1 rij in `tenants`, 3 rijen in `users`.

---

## `email_domain` instellen op een nieuwe tenant

De `email_domain`-kolom op de `tenants`-tabel bepaalt welke tenant een gebruiker toebehoort
bij login (zie ADR-0006 § 3 — tenant-detectie via e-mail-domein-lookup).

**Bij elke nieuwe tenant moet `email_domain` worden ingesteld voordat login werkt.**

### Via SQL (Neon console of psql)

```sql
UPDATE tenants
SET email_domain = 'klant.nl'
WHERE slug = 'klant-slug';
```

### Via Prisma (script of REPL)

```typescript
await prisma.tenant.update({
  where: { slug: 'klant-slug' },
  data: { emailDomain: 'klant.nl' },
})
```

Geen `email_domain` gezet en gebruiker probeert in te loggen? Backend geeft 401
`invalid_credentials` (generiek, geen onderscheid — conform spec). Check de `tenants`-tabel.

---

## Seed-script aanpassen

Backend is eigenaar van `packages/db/prisma/seed.ts`. Wijzigingen via PR.
Seed-script NOOIT productie-tenants of echte wachtwoorden bevatten.

---

## Troubleshooting

| Fout | Oorzaak | Oplossing |
|------|---------|-----------|
| `P1001: Can't reach database` | Database niet bereikbaar | Controleer `DATABASE_URL` en netwerk |
| `P2010: Raw query failed` | Pooled URL gebruikt bij seeding | Gebruik `DIRECT_URL` zonder pooler-suffix |
| `P2002: Unique constraint failed` | Seed niet idempotent (oude versie) | Update naar laatste seed.ts of truncate handmatig |
| `Unknown command db:seed` | `db:seed` script ontbreekt in `packages/db/package.json` | Voeg `"db:seed": "prisma db seed"` toe |
| `Error: JWT_SECRET not set` | `.env` incompleet | Vul `.env` via `.env.example` + `openssl rand -hex 32` |
