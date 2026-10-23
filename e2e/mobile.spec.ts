import dayjs from 'dayjs'
import type { Locator } from '@playwright/test'
import { test, expect, openNewSubscriptionForm, seedSubscriptions } from './fixtures'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('mobile tabs, category filters, calendar payment, and page width', async ({
  page,
}, testInfo) => {
  const name = `Mobile streaming ${testInfo.testId}`
  const otherName = `Mobile music ${testInfo.testId}`
  const today = dayjs().format('YYYY-MM-DD')
  const nextDate = dayjs().add(1, 'month').format('MMM D, YYYY')
  const assertPageWidth = async () => {
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(
      true
    )
  }
  /** PRODUCT.md: touch targets are at least 44×44 on phones. */
  const assertTouchTarget = async (target: Locator) => {
    const [width, height] = await target.evaluate((element: HTMLElement) => [
      element.offsetWidth,
      element.offsetHeight,
    ])
    expect(Math.min(width, height), 'touch target size').toBeGreaterThanOrEqual(44)
  }

  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(tabs).toBeVisible()
  await assertPageWidth()
  await tabs.getByRole('link', { name: 'Subs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: /add subscription/i }).click()
  const picker = page.getByRole('dialog', { name: 'Add Subscription' })
  await expect(picker).toBeVisible()
  await assertTouchTarget(picker.getByRole('button', { name: 'Close', exact: true }))
  await assertTouchTarget(picker.getByRole('button', { name: 'All', exact: true }))
  await picker.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(picker).not.toBeVisible()

  for (const [subscriptionName, category] of [
    [name, 'Streaming'],
    [otherName, 'Music'],
  ]) {
    const form = await openNewSubscriptionForm(page)
    await form.getByRole('textbox', { name: /^Name/ }).fill(subscriptionName)
    await form.getByRole('spinbutton', { name: /^Amount/ }).fill('12.99')
    await form.getByLabel(/^Next payment/).fill(today)
    await form.getByRole('combobox', { name: 'Category', exact: true }).click()
    await page.getByRole('option', { name: category, exact: true }).click()
    await form.getByRole('button', { name: 'Add Subscription', exact: true }).click()
    await expect(form).not.toBeVisible()
  }

  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const filters = page.getByRole('dialog', { name: 'Filters and view' })
  await expect(filters).toBeVisible()
  await assertPageWidth()
  await assertTouchTarget(filters.getByRole('button', { name: 'Close', exact: true }))
  await filters.getByRole('button', { name: /^Streaming 1$/ }).click()
  await expect(filters.getByRole('button', { name: /^Streaming 1$/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await filters.getByRole('button', { name: 'Show 1 result', exact: true }).click()
  await expect(filters).not.toBeVisible()
  await expect(page.getByRole('button', { name: `More actions for ${name}` })).toBeVisible()
  await expect(page.getByRole('button', { name: `More actions for ${otherName}` })).toHaveCount(0)
  await assertPageWidth()

  await tabs.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
  await page
    .getByRole('button', { name: new RegExp(`${dayjs().format('MMMM D')},.*2 payments`) })
    .click()
  const day = page.getByRole('dialog', { name: dayjs().format('dddd, MMMM D') })
  await expect(day).toBeVisible()
  await assertPageWidth()
  await assertTouchTarget(day.getByRole('button', { name: 'Close', exact: true }))
  const payment = day.getByRole('listitem').filter({ hasText: name })
  await payment.getByRole('button', { name: 'Mark paid', exact: true }).click()
  await expect(page.getByText(`Marked ${name} as paid`, { exact: true })).toBeVisible()
  await expect(page.getByText(`Next payment ${nextDate}.`, { exact: true })).toBeVisible()
  await expect(payment.getByText('Paid', { exact: true })).toBeVisible()
  // The pressed button is gone; focus stays on that payment inside the dialog.
  await expect(payment.getByRole('heading', { name, level: 3 })).toBeFocused()
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await assertPageWidth()

  await tabs.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await assertPageWidth()
  await tabs.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await assertPageWidth()
})

/** PRODUCT.md: touch targets are at least 44×44 on phones. */
async function assertTouchTarget(target: Locator) {
  const [width, height] = await target.evaluate((element: HTMLElement) => [
    element.offsetWidth,
    element.offsetHeight,
  ])
  expect(Math.min(width, height), 'touch target size').toBeGreaterThanOrEqual(44)
}

test('dashboard keeps a 30-character upcoming name and the monthly figure inside the phone width', async ({
  page,
}) => {
  const name = 'Adobe Creative Cloud Pro Teams'
  expect(name).toHaveLength(30)
  await seedSubscriptions(page, [
    {
      id: 'sub-adobe',
      name,
      amount: 89.99,
      next_payment_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    },
    // A large commitment: the figure steps down a size instead of breaking mid-number.
    { id: 'sub-fleet', name: 'Fleet', amount: 1234567.89, next_payment_date: null },
  ])

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const ledger = page.getByRole('region', { name: 'Upcoming charges' })
  await expect(ledger.getByText(name, { exact: true })).toBeVisible()

  const figure = page
    .getByRole('region', { name: 'Monthly equivalent' })
    .getByText('$1,234,657.88', { exact: true })
  await expect(figure).toBeVisible()
  const lineHeight = await figure.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
  })
  expect(lineHeight, 'the figure renders on one line').toBe(1)

  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBe(
    await page.evaluate(() => innerWidth)
  )
  // main is its own (paint-contained) scroller, so an overflowing card never widens the page;
  // check that nothing inside it reaches past the right edge of the screen instead.
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('#main-content *')]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 0.5)
      .map((element) => `${element.tagName.toLowerCase()} "${element.textContent?.slice(0, 40)}"`)
  )
  expect(overflowing).toEqual([])
})

test('dashboard ledger resolves charges in place on a phone', async ({ page }) => {
  await seedSubscriptions(page, [
    {
      id: 'sub-kit',
      name: 'Meal Kit',
      amount: 69,
      shared_count: 2,
      billing_cycle: 'weekly',
      next_payment_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    },
    {
      id: 'sub-drive',
      name: 'Cloud Drive',
      amount: 9.99,
      next_payment_date: dayjs().add(2, 'day').format('YYYY-MM-DD'),
    },
    // A trial ending soon puts the decision preview above the ledger.
    {
      id: 'sub-trial',
      name: 'Trial Studio',
      status: 'trial',
      trial_end_date: dayjs().add(2, 'day').format('YYYY-MM-DD'),
      next_payment_date: null,
    },
  ])

  await page.goto('/')
  const ledger = page.getByRole('region', { name: 'Upcoming charges' })
  const kitRows = ledger.getByRole('listitem').filter({ hasText: 'Meal Kit' })
  // Weekly: every occurrence from tomorrow through today + 29.
  await expect(kitRows).toHaveCount(5)
  const kit = kitRows.first()
  await expect(kit).toContainText('$69.00')
  await expect(kit).toContainText('Your share $34.50 · split 2 ways')

  const markPaid = kit.getByRole('button', { name: 'Mark paid', exact: true })
  await assertTouchTarget(markPaid)
  await assertTouchTarget(kit.getByRole('button', { name: /^More actions for Meal Kit/ }))
  // Phones keep Skip in the More menu.
  await expect(kit.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0)

  await markPaid.click()
  await expect(page.getByText('Marked Meal Kit as paid', { exact: true })).toBeVisible()
  await expect(kitRows).toHaveCount(4)
  // The paid row left the list; focus moved to the row that took its place, not the page.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-ledger-focus')))
    .toBeTruthy()

  const drive = ledger.getByRole('listitem').filter({ hasText: 'Cloud Drive' })
  await drive.getByRole('button', { name: /^More actions for Cloud Drive/ }).click()
  await page.getByRole('menuitem', { name: 'Skip this payment' }).click()
  await expect(page.getByText('Skipped Cloud Drive', { exact: true })).toBeVisible()
  await expect(drive).toHaveCount(0)

  // The decision preview's controls meet the touch floor too, "Show all" included.
  const preview = page.getByRole('region', { name: 'Needs a decision' })
  await expect(preview).toContainText('Trial Studio')
  await assertTouchTarget(preview.getByRole('button', { name: 'Review Trial Studio' }))
  const showAll = preview.getByRole('button', { name: 'Show all decisions' })
  await assertTouchTarget(showAll)
  await showAll.click()
  await expect(page.getByRole('heading', { name: 'Decisions', level: 2 })).toBeFocused()
})
