# Dockerfile — apps/api
# Multi-stage build. Doelplatform: linux/amd64 (Fly.io), toekomst: AWS ECS Fargate.
# Gebruikt `pnpm deploy` om een self-contained productie-bundle te maken,
# zodat de pnpm virtual-store symlinkstructuur niet in de runtime-image belandt.

# ─── Stage 1: deps ──────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# pnpm via corepack — versie uit package.json engines.
ENV PNPM_VERSION=9.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Kopieer workspace-manifests voor optimale cache-laag.
# Wijzigingen in broncode invalideren deze laag niet.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/

# Installeer alle dependencies (incl. devDeps voor build).
# HUSKY=0: voorkomt dat prepare-script faalt (husky niet aanwezig in container).
# --frozen-lockfile: expliciete lock-controle, nooit stil upgraden.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile

# ─── Stage 2: build ─────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Kopieer alle bronbestanden.
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY apps/api/ ./apps/api/

# Bouw contracts eerst (api importeert hieruit).
RUN pnpm --filter=@hr-saas/contracts build

# Genereer Prisma-client + compileer packages/db naar dist/.
# DATABASE_URL hoeft hier niet beschikbaar te zijn — generate doet geen DB-verbinding.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter=@hr-saas/db build

# Compileer TypeScript → dist/.
RUN pnpm --filter=@hr-saas/api build

# Bundel de api + productie-deps + workspace-deps in één self-contained directory.
# pnpm deploy lost de volledige virtuele-store structuur op en schrijft echte
# node_modules (zonder symlinks naar de centrale store) naar /tmp/api-deploy.
# --prod garandeert dat testcontainers/supertest/cpu-features worden uitgesloten.
RUN pnpm --filter=@hr-saas/api deploy --prod /tmp/api-deploy

# Kopieer Prisma-schema in de deploy-dir zodat migrate deploy werkt bij runtime.
RUN cp -r packages/db/prisma /tmp/api-deploy/prisma

# ─── Stage 3: runtime ───────────────────────────────────────────────────────
# Geen tweede pnpm install nodig — /tmp/api-deploy is volledig self-contained.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# OpenSSL runtime-bibliotheek — vereist door Prisma op Alpine/musl.
# Zonder dit logt Prisma een waarschuwing over ontbrekende SSL-binaries.
RUN apk add --no-cache openssl

# Non-root user voor minimale aanvalsvlakte.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs apiuser

# Kopieer de self-contained bundle vanuit de builder.
# dist/ bevat al packages/db/dist en packages/contracts/dist via pnpm deploy.
COPY --from=builder /tmp/api-deploy/dist         ./dist
COPY --from=builder /tmp/api-deploy/node_modules ./node_modules
COPY --from=builder /tmp/api-deploy/package.json ./package.json
COPY --from=builder /tmp/api-deploy/prisma       ./prisma

# Eigendom overzetten aan non-root user.
RUN chown -R apiuser:nodejs /app

USER apiuser

EXPOSE 4000

# Healthcheck — Fly gebruikt /healthz, maar Docker zelf ook.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1

# server.js staat direct in dist/ na pnpm deploy (niet meer apps/api/dist/).
CMD ["node", "dist/server.js"]
