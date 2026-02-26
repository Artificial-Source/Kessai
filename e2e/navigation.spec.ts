import { test, expect } from './fixtures'

test.describe('Navigation', () => {
  test('should load the dashboard page by default', async ({ page }) => {
    await page.goto('/')

    // Should show dashboard heading
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  })

  test('should navigate to subscriptions page', async ({ page }) => {
    await page.goto('/')

    // Click subscriptions nav link
    await page.getByRole('link', { name: /subscriptions/i }).click()

    // Should show subscriptions heading
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should navigate to calendar page', async ({ page }) => {
    await page.goto('/')

    // Click calendar nav link
    await page.getByRole('link', { name: /calendar/i }).click()

    // Should show calendar heading
    await expect(page.getByRole('heading', { name: /calendar/i })).toBeVisible()
  })

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/')

    // Click settings nav link
    await page.getByRole('link', { name: /settings/i }).click()

    // Should show settings heading
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })
})
