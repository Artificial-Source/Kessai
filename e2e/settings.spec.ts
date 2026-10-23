import { test, expect } from './fixtures'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /settings/i }).click()
    // Wait for settings to load (mock resolves quickly)
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('should display settings page @web-only', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('should show theme options', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible()
  })

  test('should show currency options', async ({ page }) => {
    await expect(page.getByText('Default currency', { exact: true })).toBeVisible()
  })

  test('should show data management section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Data & Backup' })).toBeVisible()
  })

  test('should toggle theme', async ({ page }) => {
    const darkButton = page.getByRole('button', { name: /dark/i })
    const lightButton = page.getByRole('button', { name: /light/i })

    // Toggle to light
    await lightButton.click()
    // Toggle back to dark
    await darkButton.click()
  })

  test('should apply private web access controls', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Private Web Access' })).toBeVisible()
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Private Web Access key')).toHaveCount(0)

    await page.getByRole('switch', { name: 'Enable Private Web Access' }).click()
    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(page.getByText('Running', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Private Web Access key')).toHaveText('e2e-private-access-key-1')
    await expect(page.getByRole('button', { name: 'Copy access key' })).toBeVisible()
  })

  test('should toggle launch at login', async ({ page }) => {
    const launchToggle = page.getByRole('switch', { name: 'Launch Kessai at login' })
    await expect(launchToggle).toBeVisible()
    await expect(launchToggle).toHaveAttribute('aria-checked', 'false')

    await launchToggle.click()
    await expect(launchToggle).toHaveAttribute('aria-checked', 'true')

    await launchToggle.click()
    await expect(launchToggle).toHaveAttribute('aria-checked', 'false')
  })
})
