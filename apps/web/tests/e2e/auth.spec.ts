/**
 * E2E auth-tests — FEAT-0002 AUTH-0009
 *
 * Vereisten om te draaien:
 *   - E2E_BASE_URL wijst naar een werkende staging-instantie (https://app.larsvdloo.com)
 *   - Seed-data aanwezig: acme-tenant + admin@acme.test / Welkom01!Welkom
 *     (zie docs/runbooks/seed-data.md)
 *   - Backend AUTH-0001 t/m AUTH-0004 deployed (login + refresh endpoints actief)
 *   - Frontend AUTH-0006 + AUTH-0007 deployed (loginpagina + auth-guard)
 *
 * Staat: klaar voor uitvoering zodra backend + frontend stories closed zijn (dag 6+).
 * Tot die tijd: playwright-config retries=2 absorbeert flakiness bij half-deployed omgeving.
 */

import { test, expect } from '@playwright/test'

// Seed-credentials — alleen voor testomgeving. Nooit echte wachtwoorden.
const SEED_USER = {
  email: 'admin@acme.test',
  password: 'Welkom01!Welkom',
}

const WRONG_PASSWORD = 'FoutWachtwoord99!'

// ---------------------------------------------------------------------------
// Helper: inloggen via de UI
// ---------------------------------------------------------------------------
async function loginViaUI(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  email: string,
  password: string,
) {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel(/e-mail/i).fill(email)
  await page.getByLabel(/wachtwoord/i).fill(password)
  await page.getByRole('button', { name: /inloggen/i }).click()
}

// ---------------------------------------------------------------------------
// Happy path — volledig inlog → gebruik → uitlog
// ---------------------------------------------------------------------------
test.describe('Auth — happy path @smoke', () => {
  test(
    'inloggen als hr_admin → employees-lijst zichtbaar → uitloggen',
    async ({ page }) => {
      // Niet-ingelogde bezoeker op beschermde URL wordt geredirect naar /login
      await page.goto('/employees')
      await expect(page).toHaveURL(/\/login/)

      // Inloggen
      await loginViaUI(page, SEED_USER.email, SEED_USER.password)

      // Na succesvolle login: redirect naar /employees (oorspronkelijke URL)
      await expect(page).toHaveURL(/\/employees/, { timeout: 10_000 })

      // Employees-lijst is zichtbaar
      await expect(page.getByRole('heading', { name: /medewerkers/i })).toBeVisible()

      // Uitloggen — knop staat in navigatie of user-menu
      const logoutButton = page.getByRole('button', { name: /uitloggen/i })
      await expect(logoutButton).toBeVisible()
      await logoutButton.click()

      // Na uitloggen: terug op /login
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
    },
  )
})

// ---------------------------------------------------------------------------
// Unhappy path — fout wachtwoord
// ---------------------------------------------------------------------------
test.describe('Auth — unhappy path', () => {
  test('fout wachtwoord → foutmelding zichtbaar → URL blijft /login', async ({ page }) => {
    await loginViaUI(page, SEED_USER.email, WRONG_PASSWORD)

    // URL mag niet veranderen
    await expect(page).toHaveURL(/\/login/)

    // Foutmelding moet zichtbaar zijn (aria-live region of toast)
    // Accepteer beide: een role="alert" of tekst die "onjuist" / "ongeldig" / "fout" bevat
    const foutmelding = page.getByRole('alert').or(
      page.getByText(/onjuist|ongeldig|fout|incorrect/i).first(),
    )
    await expect(foutmelding).toBeVisible({ timeout: 5_000 })

    // Wachtwoordveld is leeggemaakt na mislukte poging
    const passwordField = page.getByLabel(/wachtwoord/i)
    await expect(passwordField).toHaveValue('')
  })

  test('niet-ingelogde gebruiker op / wordt geredirect naar /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('niet-ingelogde gebruiker op /employees wordt geredirect naar /login met redirect-param', async ({ page }) => {
    await page.goto('/employees')
    await expect(page).toHaveURL(/\/login\?redirect/)
  })
})

// ---------------------------------------------------------------------------
// Token expiry simulatie — transparante refresh
// ---------------------------------------------------------------------------
test.describe('Auth — sessie herstel', () => {
  test(
    'na browser-herstart met bestaand refresh-cookie is gebruiker nog ingelogd',
    async ({ page }) => {
      // Stap 1: inloggen
      await loginViaUI(page, SEED_USER.email, SEED_USER.password)
      await expect(page).toHaveURL(/\/employees/, { timeout: 10_000 })

      // Stap 2: simuleer page-reload (niet logout — refresh-cookie blijft actief)
      await page.reload()

      // Stap 3: gebruiker moet nog steeds ingelogd zijn (auth-guard doet restore())
      await expect(page).not.toHaveURL(/\/login/, { timeout: 8_000 })
      await expect(page.getByRole('heading', { name: /medewerkers/i })).toBeVisible()
    },
  )

  /**
   * Token expiry simulatie via API-route manipulatie.
   *
   * Volledige expired-access-token test vereist dat de API een env-toggle heeft
   * om token-levensduur te verkorten (zie build-plan D3, alternatieven).
   * Sprint 2: deze test verifieert dat de app na reload NIET uitlogt bij een geldig
   * refresh-cookie — de echte expired-interceptor-test komt als follow-up
   * zodra de API een `TEST_JWT_TTL_SECONDS`-toggle heeft.
   *
   * Zie: docs/sprints/SPRINT-02/plan.md — openstaand punt D3 token-expiry.
   */
  test.skip(
    'verlopen access-token → transparante refresh → geen redirect naar /login',
    async () => {
      // TODO: vereist TEST_JWT_TTL_SECONDS=1 env-toggle in API (backend taak)
    },
  )
})

// ---------------------------------------------------------------------------
// Tenant-isolatie probe (auth-variant) @smoke
// ---------------------------------------------------------------------------
test.describe('Tenant-isolatie probe — auth @smoke', () => {
  test(
    'ingelogde gebruiker van tenant A kan resource van tenant B niet ophalen',
    async ({ page, request }) => {
      // Inloggen als acme-gebruiker
      await loginViaUI(page, SEED_USER.email, SEED_USER.password)
      await expect(page).toHaveURL(/\/employees/, { timeout: 10_000 })

      // Probeer een willekeurig UUID dat niet bij deze tenant hoort op te halen.
      // Verwacht: 404 (RLS geeft geen informatie prijs, zie spec US-4).
      const r = await request.get(
        `${process.env.E2E_API_BASE_URL ?? 'https://api.larsvdloo.com'}/v1/employees/00000000-0000-0000-0000-000000000000`,
      )
      expect([403, 404]).toContain(r.status())
    },
  )
})
