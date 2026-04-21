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
    typeCheck: true,
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:4000',
    },
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
