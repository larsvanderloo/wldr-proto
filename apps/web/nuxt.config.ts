export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    '@nuxtjs/i18n',
  ],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    // typeCheck tijdens build uitgeschakeld: vite-plugin-checker roept vue-tsc aan
    // terwijl .nuxt/-types nog niet volledig zijn (race-conditie). Typecheck loopt
    // als aparte stap in ci-local.sh (stap 4) en GitHub Actions.
    typeCheck: false,
  },

  // Nitro preset: 'vercel' in productie, lokaal wordt de preset genegeerd.
  // NUXT_NITRO_PRESET=vercel wordt door Vercel automatisch gezet; lokaal
  // draait Nitro zonder preset (node-server). Geen aparte if/else nodig.
  nitro: {
    preset: process.env.NITRO_PRESET ?? 'node-server',
  },

  // Workspace-packages transpileren — Vite/Rollup heeft anders moeite met
  // pnpm-symlinks + ESM subpath-exports (@hr-saas/contracts/auth etc.).
  build: {
    transpile: ['@hr-saas/contracts', '@hr-saas/db'],
  },

  i18n: {
    defaultLocale: 'nl-NL',
    strategy: 'no_prefix',
    locales: [
      { code: 'nl-NL', language: 'nl-NL', name: 'Nederlands', file: 'nl-NL.json' },
      { code: 'en-US', language: 'en-US', name: 'English',    file: 'en-US.json' },
    ],
    lazy: true,
    langDir: 'locales',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'nl-NL' },
      titleTemplate: '%s · HR SaaS',
    },
  },

  // Tenants kiezen eigen branding — via runtimeConfig per tenant.
  ui: {
    colorMode: true,
  },
})
