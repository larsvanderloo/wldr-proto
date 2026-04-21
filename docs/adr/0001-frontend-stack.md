# ADR-0001: Nuxt 4 + Nuxt UI v4 + Pinia Colada voor de web-app

- **Status**: accepted
- **Datum**: 2026-04-21
- **Auteur**: architect
- **Reviewers**: pm, frontend

## Context

We bouwen een multi-tenant HR SaaS voor MKB tot mid-market. De web-app moet:

- SSR voor snelle first paint en SEO (publieke marketing-routes later, onboarding-links nu)
- Rijke formulieren en tabellen met server-side sort/filter/paginatie
- i18n dag 1 (nl-NL default, en-US fallback), Nederland als primaire markt
- Sterke accessibility-baseline (WCAG 2.1 AA) zonder per component opnieuw het wiel uit te vinden
- Typing end-to-end: request/response-shapes zijn de waarheid, niet duplicates in client
- Klein team van agents — ecosystem-keuzes moeten boring en goed gedocumenteerd zijn

## Besluit

We kiezen **Nuxt 4** als framework, **Nuxt UI v4** als component-library, **Pinia** voor UI-state en **Pinia Colada** (via `@pinia/colada-nuxt`) voor alle server-state.

Zod-contracten in `packages/contracts/` zijn de single source of truth. `UForm` consumeert dezelfde Zod-schemas die de Fastify-backend gebruikt voor request-validatie.

## Consequenties

### Positief
- Nuxt 4 levert SSR, file-based routing, auto-imports en een sterke DX zonder handmatige plumbing.
- Nuxt UI v4 (125+ componenten op Reka UI + Tailwind) dekt vrijwel alles wat we nodig hebben. Accessibility-baseline is goed. Semantische kleuren (`text-default`, `bg-elevated`) maken theming per tenant later haalbaar.
- Pinia Colada scheidt server-state netjes van UI-state en heeft SSR-integratie out-of-the-box (`onServerPrefetch`). Geen duplicate-caching in Pinia-stores meer.
- Eén Zod-schema dekt client-validatie en server-validatie. Breaking API-changes breken TypeScript-builds, niet runtime.

### Negatief / trade-offs
- Nuxt UI v4 is jonger dan bijvoorbeeld shadcn/vue. Als een specifiek component ontbreekt, moeten we zelf iets bouwen op Reka UI.
- Pinia Colada is nieuwer dan TanStack Query. Minder Stack Overflow-antwoorden, maar de API is klein en de maintainer (posva) is actief.
- Team moet discipline houden: geen `useFetch`/`useAsyncData` voor gedeelde server-state, geen server-data in Pinia-stores. Dit staat in de `frontend`-agent.

### Neutraal
- Nuxt UI MCP-server is vereist voor de `frontend`-agent om component-API's accuraat op te zoeken (niet raden).

## Alternatieven overwogen

### Next.js + shadcn/ui + TanStack Query
- Overwogen: grotere ecosystem, meer Claude-training-data.
- Afgevallen: team voorkeur voor Vue; Nuxt UI v4 is een complete solution met theming-verhaal dat shadcn/vue (per-component copy-paste) niet heeft. Pinia Colada is bewezen werkend met Nuxt-SSR.

### Nuxt 3 + Nuxt UI v2
- Overwogen: meer Stack Overflow-content.
- Afgevallen: Nuxt 4 en Nuxt UI v4 zijn GA, en een migratie later is duurder dan nu goed starten.

### Vue (Vite) zonder Nuxt, losse Vue Router + SSR
- Overwogen: lichter, minder opinion.
- Afgevallen: we herbouwen dan alle plumbing die Nuxt gratis geeft (data-loaders, SSR, auto-imports, i18n-integratie). Niet de moeite voor een greenfield product.

## Vervolgactie

- Frontend-agent heeft deze stack als vaste baseline in `.claude/agents/frontend.md`.
- `packages/contracts/` is opgezet en wordt door `UForm` en Fastify beide geconsumeerd.
- Nuxt UI MCP-server moet door elke ontwikkelaar (en agent) geconfigureerd zijn: `claude mcp add --transport http nuxt-ui https://ui.nuxt.com/mcp`.
