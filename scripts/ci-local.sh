#!/usr/bin/env bash
# scripts/ci-local.sh
# Lokale CI-run — identieke stappen aan .github/workflows/ci.yml.
# Husky pre-push draait dit; het script faalt snel bij elke fout.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Kleuren
BOLD=$(tput bold 2>/dev/null || printf '')
GREEN=$(tput setaf 2 2>/dev/null || printf '')
RED=$(tput setaf 1 2>/dev/null || printf '')
YELLOW=$(tput setaf 3 2>/dev/null || printf '')
RESET=$(tput sgr0 2>/dev/null || printf '')

step() { printf "\n${BOLD}==> %s${RESET}\n" "$1"; }
ok()   { printf "${GREEN}✓ %s${RESET}\n" "$1"; }
skip() { printf "${YELLOW}○ %s${RESET}\n" "$1"; }
fail() { printf "${RED}✗ %s${RESET}\n" "$1"; exit 1; }

START=$(date +%s)

# 0. Tool-versies
step "Tool-versies controleren"
node --version
pnpm --version

# 1. Install
step "Dependencies installeren"
pnpm install --frozen-lockfile
ok "dependencies geïnstalleerd"

# 2. Packages bouwen (contracts + db — inclusief Prisma generate + tsc → dist/)
step "Packages bouwen (contracts + db)"
pnpm --filter="./packages/*" build
ok "packages gebouwd"

# 3. Lint
step "Lint (eslint)"
pnpm lint
ok "lint groen"

# 4. Typecheck
step "Typecheck (tsc --noEmit)"
pnpm typecheck
ok "typecheck groen"

# 5. Unit tests
step "Unit tests (vitest)"
pnpm test
ok "unit tests groen"

# 6. Integration tests (vereist Docker voor Testcontainers)
step "Integration tests (backend + Postgres via Testcontainers)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  pnpm test:integration
  ok "integration tests groen"
else
  skip "Docker niet beschikbaar — integration tests overgeslagen (CI draait dit altijd)"
fi

# 7. Build (nuxt build + tsc voor api)
step "Build (nuxt build + tsc voor api)"
pnpm build
ok "build groen"

# 8. Dependency audit (advisories)
step "Dependency audit"
pnpm audit --prod --audit-level=high || fail "kwetsbaarheden ≥ HIGH gevonden — los op of markeer expliciet"
ok "audit groen"

END=$(date +%s)
ELAPSED=$((END - START))

printf "\n${BOLD}${GREEN}✓ Lokale CI groen in ${ELAPSED}s${RESET}\n"
