// apps/web/eslint.config.js — Nuxt 4 + Vue 3 + TS strict flat config
//
// Stapelt bovenop de root config (../../eslint.config.js):
//   1. Root-regels voor TS/JS worden geërfd (type-aware, no-floating-promises, etc.)
//   2. eslint-plugin-vue flat/strongly-recommended voor alle .vue-bestanden
//   3. vue-eslint-parser met @typescript-eslint/parser voor <script lang="ts">
//   4. Nuxt-globals als globals zodat no-undef niet valt over auto-imports
//   5. Vue 3 + Nuxt 4 specifieke regel-overrides

import rootConfig from '../../eslint.config.js'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'

// Nuxt 4 auto-import globals — composables, utils en lifecycle-hooks die Nuxt
// injecteert zonder expliciete import. Aanvullen wanneer nieuwe Nuxt-modules
// extra globals toevoegen (bv. @nuxtjs/i18n → useI18n).
const NUXT_GLOBALS = {
  // Nuxt core composables
  useNuxtApp: 'readonly',
  useRuntimeConfig: 'readonly',
  useRoute: 'readonly',
  useRouter: 'readonly',
  navigateTo: 'readonly',
  abortNavigation: 'readonly',
  addRouteMiddleware: 'readonly',
  defineNuxtRouteMiddleware: 'readonly',
  defineNuxtPlugin: 'readonly',
  defineNuxtComponent: 'readonly',
  useNuxtData: 'readonly',
  useAsyncData: 'readonly',
  useLazyAsyncData: 'readonly',
  useFetch: 'readonly',
  useLazyFetch: 'readonly',
  useHead: 'readonly',
  useSeoMeta: 'readonly',
  useServerSeoMeta: 'readonly',
  definePageMeta: 'readonly',
  useError: 'readonly',
  showError: 'readonly',
  clearError: 'readonly',
  createError: 'readonly',
  useRequestHeaders: 'readonly',
  useRequestEvent: 'readonly',
  useAppConfig: 'readonly',
  updateAppConfig: 'readonly',
  preloadComponents: 'readonly',
  preloadRouteComponents: 'readonly',
  prefetchComponents: 'readonly',
  prerenderRoutes: 'readonly',
  refreshNuxtData: 'readonly',
  clearNuxtData: 'readonly',
  onNuxtReady: 'readonly',
  // Vue 3 reactivity / lifecycle (Nuxt auto-imports via Vue)
  ref: 'readonly',
  computed: 'readonly',
  reactive: 'readonly',
  readonly: 'readonly',
  watch: 'readonly',
  watchEffect: 'readonly',
  watchPostEffect: 'readonly',
  watchSyncEffect: 'readonly',
  isRef: 'readonly',
  unref: 'readonly',
  toRef: 'readonly',
  toRefs: 'readonly',
  toValue: 'readonly',
  toRaw: 'readonly',
  markRaw: 'readonly',
  shallowRef: 'readonly',
  shallowReactive: 'readonly',
  shallowReadonly: 'readonly',
  triggerRef: 'readonly',
  customRef: 'readonly',
  isProxy: 'readonly',
  isReactive: 'readonly',
  isReadonly: 'readonly',
  onMounted: 'readonly',
  onUnmounted: 'readonly',
  onBeforeMount: 'readonly',
  onBeforeUnmount: 'readonly',
  onUpdated: 'readonly',
  onBeforeUpdate: 'readonly',
  onErrorCaptured: 'readonly',
  onActivated: 'readonly',
  onDeactivated: 'readonly',
  onServerPrefetch: 'readonly',
  nextTick: 'readonly',
  provide: 'readonly',
  inject: 'readonly',
  defineComponent: 'readonly',
  defineAsyncComponent: 'readonly',
  defineExpose: 'readonly',
  defineProps: 'readonly',
  defineEmits: 'readonly',
  defineSlots: 'readonly',
  defineModel: 'readonly',
  withDefaults: 'readonly',
  useSlots: 'readonly',
  useAttrs: 'readonly',
  // @nuxtjs/i18n
  useI18n: 'readonly',
  useLocalePath: 'readonly',
  useSwitchLocalePath: 'readonly',
  useLocaleHead: 'readonly',
  // Pinia (Nuxt auto-imports via @pinia/nuxt)
  defineStore: 'readonly',
  storeToRefs: 'readonly',
  acceptHMRUpdate: 'readonly',
  // Pinia Colada (via @pinia/colada-nuxt)
  useQuery: 'readonly',
  useMutation: 'readonly',
  useQueryCache: 'readonly',
  useInfiniteQuery: 'readonly',
  // Nuxt UI (@nuxt/ui auto-imports)
  useToast: 'readonly',
  useModal: 'readonly',
  useSlideover: 'readonly',
  useOverlay: 'readonly',
}

export default tseslint.config(
  // --- Root-config erven ---
  ...rootConfig,

  // --- Vue-bestanden: vue-eslint-parser + TS-parser voor <script lang="ts"> ---
  // eslint-plugin-vue's flat/strongly-recommended bevat al de parser-registratie
  // voor vue-eslint-parser, maar de TS-parser voor de script-block moeten we
  // zelf injecteren via parserOptions.parser.
  ...pluginVue.configs['flat/strongly-recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        // @typescript-eslint/parser verwerkt de <script lang="ts"> block
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        // Nuxt genereert .nuxt/tsconfig.json — dat is de tsconfig voor de app.
        // projectService vindt die automatisch via tsconfigRootDir.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
      globals: NUXT_GLOBALS,
    },
    rules: {
      // --- Vue 3 + Nuxt 4 aanpassingen op strongly-recommended ---

      // Vue 3 Composition API gebruikt <script setup> zonder een component-naam.
      // strongly-recommended wil een naam — dat is onwerkbaar in Nuxt file-routing.
      'vue/require-default-prop': 'off',

      // Multi-word component names: Nuxt UI-components zijn single-word (UButton,
      // UInput, UTable). definePageMeta-components hoeven geen prefix. We handhaven
      // de regel voor eigen components (EmployeeTable, MaskedField, etc.) maar
      // whitelisten de Nuxt UI prefix-patronen niet — dat doet vue/match-component-import-name niet.
      // Praktisch: eigen components zijn altijd multi-word (Can, MaskedField = ok).
      'vue/multi-word-component-names': [
        'error',
        {
          // Nuxt page-components mogen single-word zijn (index, [id], new)
          // want ze zijn geen gedeelde components — ze zijn routes.
          // Nuxt page-components mogen single-word zijn (routes, geen herbruikbare components).
          // Can is een gevestigd RBAC-patroon (vgl. casl.js <Can>) — bewust single-word.
          ignores: ['index', '[id]', 'new', 'default', 'Can', 'login'],
        },
      ],

      // <script setup> gebruikt defineProps / defineEmits zonder import —
      // dat zijn compiler macros, geen echte globals. ESLint ziet ze niet als
      // undefined omdat ze in NUXT_GLOBALS staan.
      'vue/no-undef-components': 'off',

      // Nuxt UI-components (UButton, UInput, UTable etc.) worden globaal
      // geregistreerd via @nuxt/ui — geen expliciete import nodig.
      // vue/no-undef-components zou hier fout-positieven geven.

      // Volgorde van attributes: pragmatisch — v-if/v-for/v-model eerst.
      'vue/attributes-order': [
        'warn',
        {
          order: [
            'DEFINITION',
            'LIST_RENDERING',
            'CONDITIONALS',
            'RENDER_MODIFIERS',
            'GLOBAL',
            'UNIQUE',
            'TWO_WAY_BINDING',
            'OTHER_DIRECTIVES',
            'OTHER_ATTR',
            'EVENTS',
            'CONTENT',
          ],
          alphabetical: false,
        },
      ],

      // HTML self-closing: void elements self-close, components ook.
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'never', component: 'always' },
          svg: 'always',
          math: 'always',
        },
      ],

      // Max 1 attribute per regel boven 2 attributen — leesbaarheid.
      'vue/max-attributes-per-line': [
        'warn',
        { singleline: { max: 3 }, multiline: { max: 1 } },
      ],

      // <template> in <template> is valide Nuxt-patroon (v-if / v-else).
      'vue/no-lone-template': 'off',

      // Nuxt 4 <script setup> met definePageMeta/defineNuxtRouteMiddleware:
      // geen floating-promise hier (navigateTo returnt Promise).
      // De root @typescript-eslint/no-floating-promises geldt al — we verfijnen niet.

      // vue/component-api-style: enforce <script setup> (Nuxt 4 standaard).
      'vue/component-api-style': ['error', ['script-setup']],

      // Enforce defineProps declaratie-stijl met TypeScript-typen (geen runtime).
      'vue/define-props-declaration': ['error', 'type-based'],

      // Enforce defineEmits declaratie-stijl met TypeScript-typen.
      'vue/define-emits-declaration': ['error', 'type-based'],

      // Blokkeer v-html — XSS-risico in een HR SaaS met PII.
      'vue/no-v-html': 'error',

      // Require v-bind:key bij v-for — Vue 3 vereiste.
      'vue/require-v-for-key': 'error',
    },
  },

  // --- TS-bestanden binnen apps/web: globals aanvullen ---
  // Composables en stores gebruiken ook Nuxt auto-imports (ref, computed, useI18n etc.)
  {
    files: ['app/**/*.ts', 'app/**/*.tsx'],
    languageOptions: {
      globals: NUXT_GLOBALS,
    },
  },

  // --- Nitro server-routes (apps/web/server/) ---
  // server/ valt buiten de Nuxt-gegenereerde tsconfig (.nuxt/tsconfig.json bevat
  // alleen app/**). Type-aware rules uitzetten — projectService kent server/ niet.
  // Globals worden niet meegegeven: server-routes gebruiken geen Nuxt-client-composables.
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // --- Config- en tool-bestanden in apps/web: geen type-aware rules ---
  // app.vue, nuxt.config.ts, colada.options.ts, playwright.config.ts, vitest.config.ts
  // en E2E-tests vallen buiten de Nuxt-gegenereerde tsconfig (.nuxt/tsconfig.json).
  // ProjectService kent ze niet → type-aware rules (no-floating-promises etc.) uitzetten.
  // Gespiegeld aan de CONFIG_AND_SCRIPTS-uitzondering in de root-config, maar hier
  // alleen voor de web-workspace-specifieke tool-bestanden.
  {
    files: [
      'app.vue',
      'nuxt.config.ts',
      'colada.options.ts',
      'playwright.config.ts',
      'vitest.config.ts',
      'tests/e2e/**/*.ts',
      'tests/unit/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      // Type-aware rules vereisen een tsconfig — uitzetten voor bestanden buiten de tsconfig.
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },

  // --- Ignores voor gegenereerde Nuxt-bestanden ---
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'node_modules/**',
    ],
  },
)
