import dayjs from 'dayjs'
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

  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(tabs).toBeVisible()
  await assertPageWidth()
  await tabs.getByRole('link', { name: 'Subs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeVisible()

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
  const payment = day.getByRole('listitem').filter({ hasText: name })
  await payment.getByRole('button', { name: 'Mark paid', exact: true }).click()
  await expect(page.getByText(`Marked ${name} as paid`, { exact: true })).toBeVisible()
  await expect(page.getByText(`Next payment ${nextDate}.`, { exact: true })).toBeVisible()
  await expect(payment.getByText('Paid', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await assertPageWidth()

  await tabs.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await assertPageWidth()
  await tabs.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await assertPageWidth()
})

test('dashboard keeps a 30-character upcoming name inside the phone width', async ({ page }) => {
  const name = 'Adobe Creative Cloud Pro Teams'
  expect(name).toHaveLength(30)
  await seedSubscriptions(page, [
    {
      id: 'sub-adobe',
      name,
      amount: 89.99,
      next_payment_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    },
  ])

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()

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
