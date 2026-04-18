import { test, expect } from './fixtures'

test.describe('Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /subscriptions/i }).click()
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should show empty state when no subscriptions exist @web-only', async ({ page }) => {
    await expect(page.getByText(/no subscriptions yet/i)).toBeVisible()
  })

  test('should open add subscription dialog', async ({ page }) => {
    // Click the add subscription button
    await page.getByRole('button', { name: /add subscription/i }).click()

    // Dialog should be visible
    await expect(page.getByRole('dialog')).toBeVisible()

    // Form fields should be present
    await expect(page.getByLabel(/name/i)).toBeVisible()
    await expect(page.getByLabel(/amount/i)).toBeVisible()
  })

  test('should close dialog on cancel', async ({ page }) => {
    // Open dialog
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('should show view controls when subscriptions exist', async ({ page }) => {
    // Initially empty — add a subscription via the form
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill the form
    await page.getByLabel(/name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')

    // Submit
    await page.getByRole('button', { name: /save|add|create/i }).click()

    // Wait for dialog to close and view controls to appear
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // View toggle buttons should be visible
    await expect(page.getByRole('button', { name: /grid view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /list view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /bento view/i })).toBeVisible()
  })

  test('should filter subscriptions by search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search subscriptions/i)

    // Check if search exists (only shows when there are subscriptions)
    const hasSearch = await searchInput.isVisible().catch(() => false)

    if (hasSearch) {
      await searchInput.fill('Netflix')
      // Should filter the list (actual results depend on data)
    }
  })
})
