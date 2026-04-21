# Runbook: Lokale ontwikkelomgeving opzetten

**Eigenaar**: devops-qa
**Laatste update**: 2026-04-21
**Zie ook**: [ADR-0003 — Lokale Postgres-runtime](../adr/0003-lokale-postgres-runtime.md)

---

## Overzicht

Dit runbook beschrijft hoe je de lokale ontwikkelomgeving opzet voor het HR SaaS-project op macOS. OrbStack is de standaard container-runtime (zie ADR-0003). Colima is de gedocumenteerde fallback voor als OrbStack niet beschikbaar is.

**Vereisten**:
- macOS (arm64 of x86_64)
- Homebrew (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`)
- Node.js >= 20.11.0 (aanbevolen via `fnm` of `nvm`)
- pnpm >= 9.0.0 (`npm install -g pnpm`)

---

## 1. OrbStack installeren (standaard)

OrbStack levert een volledige Docker-compatibele daemon en is de standaard keuze voor alle Mac-werkstations (zie ADR-0003 voor motivatie).

```bash
brew install orbstack
```

Na installatie start OrbStack automatisch en registreert het een Docker-daemon. Je hoeft niets handmatig te starten — `docker` en `docker compose` werken direct.

Verificeer de installatie:

```bash
docker info | grep "Server Version"
# Verwacht: Server Version: <versienummer>
```

---

## 2. Postgres-container starten

Start een Postgres 16-container (zelfde major als productie RDS):

```bash
docker run -d \
  --name hrsaas-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=hrsaas \
  -e POSTGRES_PASSWORD=hrsaas \
  -e POSTGRES_DB=hrsaas \
  -p 5432:5432 \
  postgres:16-alpine
```

Verificeer dat de container draait:

```bash
docker ps --filter name=hrsaas-pg
# Verwacht: STATUS = Up
```

---

## 3. Omgevingsvariabelen instellen

Maak een `.env.local` in de repo-root (staat in `.gitignore`, nooit inchecken):

```bash
cat > .env.local << 'EOF'
# Runtime + migrations URL. Lokaal identiek (geen PgBouncer in het pad).
# Productie/Neon: DATABASE_URL = pooled, DIRECT_URL = direct. Zie ADR-0005.
DATABASE_URL=postgresql://hrsaas:hrsaas@localhost:5432/hrsaas
DIRECT_URL=postgresql://hrsaas:hrsaas@localhost:5432/hrsaas
PII_ENCRYPTION_KEY=dev-only-pii-key-change-in-prod
LOG_LEVEL=debug
EOF
```

Exporteer de variabelen voor het huidige shell-sessie:

```bash
export $(grep -v '^#' .env.local | xargs)
```

---

## 4. Prisma-migraties uitvoeren

```bash
pnpm --filter=@hr-saas/db migrate:dev
```

---

## 5. Dependencies installeren en dev-servers starten

```bash
pnpm install
pnpm --filter=@hr-saas/contracts build
pnpm dev   # start web (:3000) + api (:4000) parallel
```

---

## Container stoppen en starten

```bash
# Stoppen (data blijft bewaard in het volume)
docker stop hrsaas-pg

# Opnieuw starten
docker start hrsaas-pg

# Volledig verwijderen (data gaat verloren)
docker rm -f hrsaas-pg
```

---

## Troubleshooting

### Poort 5432 is al bezet

Foutmelding: `Error: Bind for 0.0.0.0:5432 failed: port is already allocated`

Mogelijke oorzaken:

1. **Een andere Postgres-instantie draait** (bv. via Homebrew):

   ```bash
   # Controleer welk proces poort 5432 bezet
   lsof -i :5432

   # Als het een homebrew-postgres is:
   brew services stop postgresql@16
   ```

2. **De hrsaas-pg container draait al**:

   ```bash
   docker start hrsaas-pg   # herstart in plaats van opnieuw aanmaken
   ```

3. **Een andere container op dezelfde poort**:

   ```bash
   docker ps -a | grep 5432
   docker stop <container-id>
   ```

### Container reset (schone lei)

Gebruik dit als de database in een inconsistente staat is geraakt:

```bash
docker rm -f hrsaas-pg

docker run -d \
  --name hrsaas-pg \
  --restart unless-stopped \
  -e POSTGRES_USER=hrsaas \
  -e POSTGRES_PASSWORD=hrsaas \
  -e POSTGRES_DB=hrsaas \
  -p 5432:5432 \
  postgres:16-alpine

# Wacht tot Postgres klaar is (~ 5 seconden)
sleep 5

# Hervoer migraties
pnpm --filter=@hr-saas/db migrate:dev
```

### OrbStack start niet

```bash
# Herstart de OrbStack-daemon
orb restart

# Of herstart via macOS Activity Monitor → OrbStack → Stop
# en open OrbStack opnieuw via Spotlight
```

### docker: command not found na OrbStack-installatie

OrbStack voegt de Docker CLI toe via een symlink. Als de shell de symlink niet vindt:

```bash
# Controleer of OrbStack in PATH staat
echo $PATH | tr ':' '\n' | grep -i orb

# Herlaad de shell-config
source ~/.zshrc   # of ~/.bashrc

# Als OrbStack nog niet in PATH staat, voeg dit toe aan ~/.zshrc:
export PATH="/Applications/OrbStack.app/Contents/MacOS:$PATH"
```

---

## Fallback: Colima (non-Mac of OrbStack niet beschikbaar)

Colima is de aanbevolen fallback als OrbStack niet beschikbaar is (zie ADR-0003). Let op: Colima start niet automatisch mee — je moet het handmatig starten bij elke werkdag.

```bash
# Installeren
brew install colima docker docker-compose

# Starten (eenmalig per werkdag of na reboot)
colima start --cpu 2 --memory 4

# Verificeer Docker-daemon
docker info | grep "Server Version"
```

Daarna zijn stappen 2 t/m 5 identiek aan de OrbStack-variant.

Auto-start instellen voor Colima (optioneel):

```bash
brew services start colima
```

---

## CI/CD

De GitHub Actions-pipelines draaien op Linux (Ubuntu) met Docker pre-installed. Geen OrbStack of Colima nodig in CI. De lokale setup via dit runbook bootst CI-gedrag na zodat "bij mij werkt het" structureel onmogelijk is.

Lokale CI volledig uitvoeren (identiek aan GitHub Actions):

```bash
pnpm ci:local   # of: bash scripts/ci-local.sh
```
