import dayjs from 'dayjs'
import { test, expect, seedSubscriptions } from './fixtures'

test.describe('Navigation', () => {
  test('should load the dashboard page by default @web-only', async ({ page }) => {
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

  test('dashboard ledger skips a charge in place and continues to the calendar', async ({
    page,
  }) => {
    await seedSubscriptions(page, [
      {
        id: 'sub-news',
        name: 'Morning News',
        amount: 12.5,
        next_payment_date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
      },
      {
        id: 'sub-music',
        name: 'Music Box',
        amount: 10.99,
        next_payment_date: dayjs().add(5, 'day').format('YYYY-MM-DD'),
      },
    ])
    await page.goto('/')
    const ledger = page.getByRole('region', { name: 'Upcoming charges' })
    await expect(ledger.getByText('$23.49', { exact: true })).toBeVisible()
    const news = ledger.getByRole('listitem').filter({ hasText: 'Morning News' })

    // Wide rows keep Mark paid and Skip side by side.
    await expect(news.getByRole('button', { name: 'Mark paid', exact: true })).toBeVisible()
    await news.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByText('Skipped Morning News', { exact: true })).toBeVisible()
    await expect(news).toHaveCount(0)
    // A skip is not a charge: the subtotal now covers the one left.
    await expect(ledger.getByText('$10.99', { exact: true }).first()).toBeVisible()

    await ledger.getByRole('link', { name: 'Open calendar' }).click()
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
  })
})
