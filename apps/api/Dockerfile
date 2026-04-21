# Dockerfile — apps/api
# Multi-stage build. Doelplatform: linux/amd64 (Fly.io), toekomst: AWS ECS Fargate.
# Node 20 LTS + pnpm. De monorepo wordt gekopieerd zodat workspace-dependencies werken.

# ─── Stage 1: deps ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# pnpm via corepack — versie uit package.json engines.
ENV PNPM_VERSION=9.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Build-tools voor native modules (cpu-features via ssh2 → testcontainers devDep).
# Verwijderd na install om image-groei te beperken.
RUN apk add --no-cache --virtual .build-deps python3 make g++ linux-headers

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
RUN pnpm install --frozen-lockfile && apk del .build-deps

# ─── Stage 2: build ─────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Kopieer alle bronbestanden.
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY apps/api/ ./apps/api/

# Bouw contracts eerst (api importeert hieruit).
RUN pnpm --filter=@hr-saas/contracts build

# Genereer Prisma-client (nodig voor TypeScript-types tijdens api-build).
# DATABASE_URL hoeft hier niet beschikbaar te zijn — generate doet geen DB-verbinding.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter=@hr-saas/db generate

# Compileer TypeScript → dist/.
RUN pnpm --filter=@hr-saas/api build

# ─── Stage 3: runtime ───────────────────────────────────────────────────────
# Kopieer alles vanuit builder — geen tweede install nodig.
# Prisma-binaries zijn al voor linux/musl (alpine) gegenereerd in builder-stage.
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Non-root user voor minimale aanvalsvlakte.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs apiuser

# Kopieer workspace-manifests (nodig voor pnpm module-resolution).
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder /app/packages/db/package.json ./packages/db/

# Kopieer node_modules vanuit builder (pnpm virtual store).
COPY --from=builder /app/node_modules ./node_modules

# Kopieer gebouwde artefacten.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist

# Kopieer Prisma-schema (nodig voor runtime migraties via prisma migrate deploy).
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# Eigendom overzetten aan non-root user.
RUN chown -R apiuser:nodejs /app

USER apiuser

EXPOSE 4000

# Healthcheck — Fly gebruikt /healthz, maar Docker zelf ook.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1

CMD ["node", "apps/api/dist/server.js"]
