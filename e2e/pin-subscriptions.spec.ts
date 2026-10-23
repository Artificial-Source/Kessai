import { test, expect, openNewSubscriptionForm } from './fixtures'

test.describe('Pin Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subscriptions')
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should pin a subscription and show pin indicator', async ({ page }) => {
    // Create a subscription
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view to access pin button
    await page.getByRole('button', { name: /list view/i }).click()

    // Pin lives in the row's named "More" menu
    await page.getByRole('button', { name: 'More actions for Netflix' }).click()
    await page.getByRole('menuitem', { name: 'Pin to top' }).click()

    // Verify the stable pinned state rather than a transient toast
    await page.getByRole('button', { name: 'More actions for Netflix' }).click()
    await expect(page.getByRole('menuitem', { name: 'Unpin' })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('should sort pinned subscription to top', async ({ page }) => {
    // Create first subscription
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Alpha Service')
    await page.getByLabel(/amount/i).fill('9.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Create second subscription
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Zeta Service')
    await page.getByLabel(/amount/i).fill('19.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Pin the second subscription (Zeta Service)
    await page.getByRole('button', { name: 'More actions for Zeta Service' }).click()
    await page.getByRole('menuitem', { name: 'Pin to top' }).click()
    await page.getByRole('button', { name: 'More actions for Zeta Service' }).click()
    await expect(page.getByRole('menuitem', { name: 'Unpin' })).toBeVisible()
    await page.keyboard.press('Escape')

    // The first subscription row exposes Zeta's named actions after pinning.
    const rows = page.getByRole('listitem').filter({
      has: page.getByRole('button', { name: /^More actions for / }),
    })
    await expect(
      rows.first().getByRole('button', { name: 'More actions for Zeta Service' })
    ).toBeVisible()
  })
})
