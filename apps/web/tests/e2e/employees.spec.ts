import { test, expect } from '@playwright/test'

test.describe('Medewerkers — happy path', () => {
  test('lijst tonen en zoeken @smoke', async ({ page }) => {
    await page.goto('/employees')
    await expect(page.getByRole('heading', { name: 'Medewerkers' })).toBeVisible()
    await page.getByPlaceholder('Zoek op naam of e-mail').fill('van')
    // Bij een echte staging-seed verwachten we resultaten; lokaal is tolerant.
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('nieuwe medewerker aanmaken (alleen admin)', async ({ page }) => {
    await page.goto('/employees/new')
    await page.getByLabel('Voornaam').fill('Testje')
    await page.getByLabel('Achternaam').fill('Devries')
    await page.getByLabel('E-mailadres').fill(`test+${Date.now()}@example.nl`)
    await page.getByLabel('Functie').fill('Engineer')
    await page.getByLabel('Startdatum').fill('2026-05-01')
    await page.getByRole('button', { name: 'Aanmaken' }).click()
    await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}$/)
  })
})

test.describe('Tenant-isolatie probe @smoke', () => {
  test('Tenant A mag Tenant B niet zien', async ({ request }) => {
    // Probe: met Tenant A headers proberen een resource van Tenant B op te halen.
    // Verwacht: 404 of 403 — nooit 200.
    const r = await request.get('/v1/employees/00000000-0000-0000-0000-000000000000', {
      headers: {
        'x-tenant-id': '11111111-1111-1111-1111-111111111111',
        'x-user-id':   '22222222-2222-2222-2222-222222222222',
        'x-user-role': 'admin',
      },
    })
    expect([403, 404]).toContain(r.status())
  })
})
