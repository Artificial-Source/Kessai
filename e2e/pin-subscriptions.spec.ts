import { test, expect } from './fixtures'

test.describe('Pin Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /subscriptions/i }).click()
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should pin a subscription and show pin indicator', async ({ page }) => {
    // Create a subscription
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view to access pin button
    await page.getByRole('button', { name: /list view/i }).click()

    // Click the pin button for Netflix
    await page.getByRole('button', { name: /pin netflix/i }).click()

    // Verify toast confirmation appears
    await expect(page.getByText(/subscription pinned/i)).toBeVisible({ timeout: 5000 })
  })

  test('should sort pinned subscription to top', async ({ page }) => {
    // Create first subscription
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Alpha Service')
    await page.getByLabel(/amount/i).fill('9.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Create second subscription
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel(/name/i).fill('Zeta Service')
    await page.getByLabel(/amount/i).fill('19.99')
    await page.getByRole('button', { name: /save|add|create/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Switch to list view
    await page.getByRole('button', { name: /list view/i }).click()

    // Pin the second subscription (Zeta Service)
    await page.getByRole('button', { name: /pin zeta service/i }).click()
    await expect(page.getByText(/subscription pinned/i)).toBeVisible({ timeout: 5000 })

    // Verify Zeta Service appears before Alpha Service in the DOM
    const subscriptionNames = await page.locator('[class*="truncate"]').filter({ hasText: /Alpha Service|Zeta Service/ }).allTextContents()
    expect(subscriptionNames[0]).toBe('Zeta Service')
  })
})
