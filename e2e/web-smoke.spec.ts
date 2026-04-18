import { test, expect, type Page } from '@playwright/test'

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
    const dashboardRequests = Promise.all([
      waitForOkGet(page, '/api/subscriptions'),
      waitForOkGet(page, '/api/categories'),
      waitForOkGet(page, '/api/settings'),
      waitForOkGet(page, '/api/subscriptions/needs-review'),
      waitForOkGet(page, '/api/payments'),
      waitForOkGet(page, '/api/price-history/recent'),
    ])

    await page.goto('/')

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
    await dashboardRequests
    await expect(page.getByText(/Web API is not running/i)).toHaveCount(0)

    const hasTauriInternals = await page.evaluate(() => '__TAURI_INTERNALS__' in window)
    expect(hasTauriInternals).toBe(false)
  })
})
