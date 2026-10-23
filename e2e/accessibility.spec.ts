import { createRequire } from 'node:module'
import type { Page } from '@playwright/test'
import dayjs from 'dayjs'
import { test, expect, openNewSubscriptionForm, seedSubscriptions } from './fixtures'

const require = createRequire(import.meta.url)
let axeModule: string | undefined
try {
  axeModule = require.resolve('@axe-core/playwright')
} catch {
  // Do not install dependencies for smoke coverage: use public accessibility contracts below.
}

async function assertAccessibilityContracts(page: Page) {
  await expect(page.getByRole('heading', { level: 1, includeHidden: true })).toHaveCount(1)
  for (const control of await page.getByRole('button').or(page.getByRole('link')).all()) {
    await expect(control).toHaveAccessibleName(/\S/)
  }
  for (const dialog of await page.getByRole('dialog').or(page.getByRole('alertdialog')).all()) {
    await expect(dialog).toHaveAccessibleName(/\S/)
  }
  const undescribedErrors = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-invalid="true"]')).flatMap((field) => {
      const descriptions = field.getAttribute('aria-describedby')?.trim().split(/\s+/) ?? []
      return descriptions.length > 0 &&
        descriptions.every((id) => document.getElementById(id)?.textContent?.trim())
        ? []
        : [field.getAttribute('aria-label') || field.id || field.tagName]
    })
  )
  expect(
    undescribedErrors,
    'Invalid fields must describe the error in the accessibility tree'
  ).toEqual([])
}

async function assertNoAxeViolations(page: Page) {
  if (!axeModule) return
  // Optional scanner may not exist on this machine; a static import would fail discovery.
  const { default: AxeBuilder } = await import(axeModule)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
}

for (const [route, title] of [
  ['/', 'Dashboard'],
  ['/subscriptions', 'My Subscriptions'],
  ['/calendar', 'Calendar'],
  ['/settings', 'Settings'],
  ['/not-a-route', 'Page not found'],
]) {
  test(`accessibility smoke: ${route}`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await assertAccessibilityContracts(page)
    await assertNoAxeViolations(page)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible()
    await assertAccessibilityContracts(page)
    await page.keyboard.press('Escape')

    if (route === '/subscriptions') {
      const form = await openNewSubscriptionForm(page)
      await form.getByRole('button', { name: 'Add Subscription', exact: true }).click()
      await expect(form.getByRole('textbox', { name: /^Name/ })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
      await assertAccessibilityContracts(page)
    }
  })
}

test('accessibility smoke: dashboard with renewals and decisions', async ({ page }) => {
  await seedSubscriptions(page, [
    {
      id: 'sub-trial',
      name: 'Trial Studio',
      status: 'trial',
      trial_end_date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
      next_payment_date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
    },
    {
      id: 'sub-due',
      name: 'Due Tomorrow',
      amount: 12,
      shared_count: 3,
      next_payment_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    },
    { id: 'sub-yen', name: 'Yen Lessons', amount: 3200, currency: 'JPY', next_payment_date: null },
  ])
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Upcoming charges', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Decisions', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Breakdown' }).click()
  await assertAccessibilityContracts(page)
  await assertNoAxeViolations(page)
})
