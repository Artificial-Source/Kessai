import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { openNewSubscriptionForm } from './fixtures'

function waitForOkGet(page: Page, pathname: string) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== 'GET' || !response.ok()) {
      return false
    }

    return new URL(response.url()).pathname === pathname
  })
}

test.describe('Web smoke', () => {
  test('loads dashboard using web REST path @web-smoke', async ({ page }) => {
    const name = `Logo persistence ${randomUUID()}`
    const dashboardRequests = Promise.all([
      waitForOkGet(page, '/api/subscriptions'),
      waitForOkGet(page, '/api/categories'),
      waitForOkGet(page, '/api/settings'),
    ])

    await page.goto('/')

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
    await dashboardRequests
    await expect(page.getByText(/Can.t reach Kessai/i)).toHaveCount(0)
    // Web mode draws no desktop window controls.
    await expect(page.getByRole('button', { name: 'Close window' })).toHaveCount(0)

    const hasTauriInternals = await page.evaluate(() => '__TAURI_INTERNALS__' in window)
    expect(hasTauriInternals).toBe(false)

    await page.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Private Web Access' })).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveCount(0)
    await expect(page.getByText('Connected locally')).toBeVisible()

    await page.getByRole('link', { name: /subscriptions/i }).click()
    const dialog = await openNewSubscriptionForm(page)
    await dialog.getByRole('textbox', { name: /^name/i }).fill(name)
    await dialog.getByLabel(/^amount/i).fill('9.99')

    // Logo upload sits in the optional "Appearance & notes" section, folded on create.
    await dialog.getByRole('button', { name: /appearance & notes/i }).click()
    const chooserPromise = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: /upload image/i }).click()
    const chooser = await chooserPromise
    await chooser.setFiles({
      name: 'custom-logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      ),
    })
    await expect(dialog.getByRole('img', { name: 'Logo preview' })).toBeVisible()
    await dialog.getByRole('button', { name: /save|add|create/i }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })
    // A decorative logo has the presentation role because its name is beside it.
    const savedRowLogo = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: `More actions for ${name}` }) })
      .getByRole('presentation')
    await expect(savedRowLogo).toBeVisible()

    await page.reload()
    await expect(savedRowLogo).toBeVisible()
  })

  test('settings with the API down asks for categories at most twice @web-smoke', async ({
    page,
  }) => {
    let categoryRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/categories') categoryRequests++
    })
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort()
    )

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    const categories = page.getByRole('region', { name: 'Categories' })
    const failed = categories.getByRole('heading', { name: "Couldn't load categories" })
    await expect(failed).toBeVisible()
    // A failed load must not retry by itself (it once looped at ~1,000 requests a second).
    await page.waitForTimeout(3000)
    expect(categoryRequests).toBeGreaterThan(0)
    expect(categoryRequests).toBeLessThanOrEqual(2)

    // Retry asks once more and settles on the same error.
    const beforeRetry = categoryRequests
    await categories.getByRole('button', { name: 'Retry' }).click()
    await page.waitForTimeout(1000)
    expect(categoryRequests).toBe(beforeRetry + 1)
    await expect(failed).toBeVisible()
  })
})
