import { test, expect } from './fixtures'

test.describe('Cancellation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /subscriptions/i }).click()
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should open cancel dialog and show preset reason chips', async ({ page }) => {
    // Create a subscription first
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view for cancel button access
    await page.getByRole('button', { name: /list view/i }).click()

    // Click cancel action on the subscription
    await page.getByRole('button', { name: /cancel netflix/i }).click()

    // Verify cancel dialog appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/cancel subscription/i)).toBeVisible()

    // Verify preset reason chips are shown
    await expect(page.getByRole('button', { name: /too expensive/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /not using/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /found alternative/i })).toBeVisible()
  })

  test('should select a preset reason and fill textarea', async ({ page }) => {
    // Create a subscription
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Spotify')
    await page.getByLabel(/amount/i).fill('9.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Open cancel dialog
    await page.getByRole('button', { name: /cancel spotify/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click "Too expensive" chip
    await page.getByRole('button', { name: /too expensive/i }).click()

    // Verify textarea has the reason text
    const textarea = page.getByPlaceholder(/why are you cancelling/i)
    await expect(textarea).toHaveValue('Too expensive')
  })

  test('should confirm cancellation and move subscription to cancelled section', async ({ page }) => {
    // Create a subscription
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Hulu')
    await page.getByLabel(/amount/i).fill('12.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Open cancel dialog
    await page.getByRole('button', { name: /cancel hulu/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Select reason and confirm
    await page.getByRole('button', { name: /too expensive/i }).click()
    await page.getByRole('button', { name: /^cancel subscription$/i }).click()

    // Verify dialog closes
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify toast confirmation
    await expect(page.getByText(/subscription cancelled/i)).toBeVisible({ timeout: 5000 })

    // Verify cancelled section appears
    await expect(page.getByText(/cancelled \(1\)/i)).toBeVisible({ timeout: 5000 })
  })
})
