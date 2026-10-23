import { test, expect, openNewSubscriptionForm } from './fixtures'

test.describe('Cancellation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subscriptions')
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should open cancel dialog and show preset reason chips', async ({ page }) => {
    // Create a subscription first
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view for cancel button access
    await page.getByRole('button', { name: /list view/i }).click()

    // Cancel lives in the row's named "More" menu
    await page.getByRole('button', { name: 'More actions for Netflix' }).click()
    await page.getByRole('menuitem', { name: 'Cancel subscription' }).click()

    // Verify cancel dialog appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: /cancel subscription/i })).toBeVisible()

    // Verify preset reason chips are shown
    await expect(page.getByRole('button', { name: /too expensive/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /not using/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /found alternative/i })).toBeVisible()
  })

  test('should select a preset reason, or Other with a written reason', async ({ page }) => {
    // Create a subscription
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Spotify')
    await page.getByLabel(/amount/i).fill('9.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Open cancel dialog
    await page.getByRole('button', { name: 'More actions for Spotify' }).click()
    await page.getByRole('menuitem', { name: 'Cancel subscription' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // One preset at a time
    const tooExpensive = page.getByRole('button', { name: /too expensive/i })
    await tooExpensive.click()
    await expect(tooExpensive).toHaveAttribute('aria-pressed', 'true')

    // "Other" replaces the preset and asks for the user's words
    await page.getByRole('button', { name: /^other$/i }).click()
    await expect(tooExpensive).toHaveAttribute('aria-pressed', 'false')
    const textarea = page.getByLabel(/your reason/i)
    await textarea.fill('Moving to a family plan')
    await expect(textarea).toHaveValue('Moving to a family plan')
  })

  test('should confirm cancellation and move subscription to cancelled section', async ({
    page,
  }) => {
    // Create a subscription
    await openNewSubscriptionForm(page)
    await page.getByLabel(/^name/i).fill('Hulu')
    await page.getByLabel(/amount/i).fill('12.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Open cancel dialog
    await page.getByRole('button', { name: 'More actions for Hulu' }).click()
    await page.getByRole('menuitem', { name: 'Cancel subscription' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Select reason and confirm
    await page.getByRole('button', { name: /too expensive/i }).click()
    await page.getByRole('button', { name: /^cancel subscription$/i }).click()

    // Verify dialog closes
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify toast confirmation
    await expect(page.getByText(/subscription cancelled/i)).toBeVisible({ timeout: 5000 })

    // Verify cancelled section appears
    await expect(page.getByRole('button', { name: /cancelled subscriptions/i })).toContainText(
      '1',
      {
        timeout: 5000,
      }
    )
  })
})
