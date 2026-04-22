<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginRequestSchema, type LoginRequest, type AuthErrorCode } from '@hr-saas/contracts/auth'

definePageMeta({ layout: false, public: true })
useHead({ title: useI18n().t('auth.login.title') })

const { t } = useI18n()
const authStore = useAuthStore()
const route = useRoute()

// Ingelogde gebruiker hoort hier niet te zijn
if (authStore.isAuthenticated) {
  await navigateTo((route.query.redirect as string) ?? '/')
}

const form = reactive<LoginRequest>({
  email: '',
  password: '',
  tenantSlug: undefined,
})

const serverError = ref<AuthErrorCode | null>(null)
const showTenantSlug = ref(false)
const isLoading = ref(false)

// WCAG 2.1 AA: aria-live region meldt serverfout aan screenreaders
const errorMessage = computed(() => {
  if (!serverError.value) return null
  switch (serverError.value) {
    case 'rate_limited':
      return t('auth.errors.rate_limited')
    case 'invalid_credentials':
    case 'tenant_mismatch':
    case 'tenant_unknown':
      return t('auth.errors.invalid_credentials')
    default:
      return t('errors.generic')
  }
})

async function onSubmit(ev: FormSubmitEvent<LoginRequest>) {
  serverError.value = null
  isLoading.value = true
  try {
    await authStore.login(ev.data)
    const redirect = (route.query.redirect as string) ?? '/'
    await navigateTo(redirect)
  }
  catch (err: unknown) {
    // Wachtwoord leegmaken na fout (spec-eis)
    form.password = ''

    const problem = (err as { problem?: { error?: string } }).problem
    const code = problem?.error as AuthErrorCode | undefined

    serverError.value = code ?? null

    // Toon tenant-slug veld na invalid_credentials (ADR-0006 § 3, secundaire flow)
    if (code === 'invalid_credentials') {
      showTenantSlug.value = true
    }
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center bg-default px-4">
    <div class="w-full max-w-sm space-y-6">
      <!-- Merk -->
      <div class="text-center">
        <h1 class="text-2xl font-semibold text-default">
          HR SaaS
        </h1>
        <p class="mt-1 text-sm text-toned">
          {{ t('auth.login.subtitle') }}
        </p>
      </div>

      <!-- Formulier -->
      <UCard>
        <UForm
          :schema="loginRequestSchema"
          :state="form"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            :label="t('auth.fields.email')"
            name="email"
            required
          >
            <UInput
              v-model="form.email"
              type="email"
              autocomplete="email"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('auth.fields.password')"
            name="password"
            required
          >
            <UInput
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              class="w-full"
            />
          </UFormField>

          <!-- Tenant-slug escape hatch: alleen zichtbaar na mislukte login -->
          <UFormField
            v-if="showTenantSlug"
            :label="t('auth.fields.tenantSlug')"
            name="tenantSlug"
            :hint="t('auth.fields.tenantSlugHint')"
          >
            <UInput
              v-model="form.tenantSlug"
              autocomplete="organization"
              class="w-full"
            />
          </UFormField>

          <!-- aria-live: screenreader-melding voor serverfout (WCAG 2.1 AA) -->
          <div
            v-if="errorMessage"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            class="rounded-md bg-error/10 px-3 py-2 text-sm text-error"
          >
            {{ errorMessage }}
          </div>

          <UButton
            type="submit"
            color="primary"
            block
            :loading="isLoading"
            :label="t('auth.login.submit')"
          />
        </UForm>
      </UCard>
    </div>
  </div>
</template>
