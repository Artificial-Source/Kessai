import { test, expect } from './fixtures'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /settings/i }).click()
    // Wait for settings to load (mock resolves quickly)
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('should display settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('should show theme options', async ({ page }) => {
    // Look for theme-related content
    await expect(page.getByText('Appearance')).toBeVisible()
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible()
  })

  test('should show currency options', async ({ page }) => {
    // Look for currency-related content
    await expect(page.getByText('Default Currency')).toBeVisible()
  })

  test('should show data management section', async ({ page }) => {
    await expect(page.getByText('Data Management')).toBeVisible()
  })

  test('should toggle theme', async ({ page }) => {
    const darkButton = page.getByRole('button', { name: /dark/i })
    const lightButton = page.getByRole('button', { name: /light/i })

    // Toggle to light
    await lightButton.click()
    // Toggle back to dark
    await darkButton.click()
  })
})
