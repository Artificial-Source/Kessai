import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dayjs from 'dayjs'
import { test, expect, type Page } from '@playwright/test'
import { openNewSubscriptionForm } from './fixtures'

async function successfulWrite(page: Page, method: string, pathname: string) {
  const response = await page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname === pathname
  )
  expect(response.ok(), `${method} ${pathname}: ${await response.text()}`).toBe(true)
  return response
}

test('subscription mutations and full-backup restore refresh every domain @web-smoke', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  const name = `Web mutations ${randomUUID()}`
  const due = dayjs().date(10)
  const next = due.add(1, 'month')
  await page.goto('/subscriptions')
  expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(false)

  await test.step('create through the subscription dialog', async () => {
    const form = await openNewSubscriptionForm(page)
    await form.getByRole('textbox', { name: /^Name/ }).fill(name)
    await form.getByRole('spinbutton', { name: /^Amount/ }).fill('11.25')
    await form.getByLabel(/^Next payment/).fill(due.format('YYYY-MM-DD'))
    const created = successfulWrite(page, 'POST', '/api/subscriptions')
    await form.getByRole('button', { name: 'Add Subscription', exact: true }).click()
    await created
    await expect(form).not.toBeVisible()
  })
  const list = await request.get('/api/subscriptions')
  expect(list.ok()).toBe(true)
  const subscription = (await list.json()).find((item: { name: string }) => item.name === name)
  expect(subscription).toBeDefined()
  const id: string = subscription.id
  const subscriptionPath = `/api/subscriptions/${id}`

  await test.step('edit the amount and persist exactly one price-history row', async () => {
    await page.getByRole('button', { name: 'List view' }).click()
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
    const form = page.getByRole('dialog', { name: `Edit ${name}`, exact: true })
    await form.getByRole('spinbutton', { name: /^Amount/ }).fill('13.75')
    const updated = successfulWrite(page, 'PUT', subscriptionPath)
    await form.getByRole('button', { name: 'Update Subscription', exact: true }).click()
    await updated
    await expect(form).not.toBeVisible()
    const history = await request.get(`/api/price-history/${id}`)
    expect(history.ok()).toBe(true)
    expect(await history.json()).toEqual([
      expect.objectContaining({ subscription_id: id, old_amount: 11.25, new_amount: 13.75 }),
    ])
  })

  await test.step('clear the budget as null through settings and REST', async () => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeFocused()
    const savedBudget = successfulWrite(page, 'PUT', '/api/settings')
    await page.getByRole('spinbutton', { name: 'Monthly budget', exact: true }).fill('200')
    await savedBudget
    const clearedBudget = successfulWrite(page, 'PUT', '/api/settings')
    await page.getByRole('button', { name: 'Clear budget', exact: true }).click()
    await clearedBudget
    await expect(page.getByRole('spinbutton', { name: 'Monthly budget', exact: true })).toHaveValue(
      ''
    )
    const settings = await request.get('/api/settings')
    expect(settings.ok()).toBe(true)
    expect((await settings.json()).monthly_budget).toBeNull()
  })

  await test.step('mark paid in the calendar and advance one billing period', async () => {
    await page.getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeFocused()
    await page
      .getByRole('button', { name: new RegExp(`^${due.format('dddd, MMMM D')},.*payment`) })
      .click()
    const panel = page.getByRole('complementary', { name: due.format('dddd, MMMM D') })
    const payment = panel.getByRole('listitem').filter({ hasText: name })
    await payment.getByRole('button', { name: 'Mark paid', exact: true }).click()
    await expect(page.getByText(`Marked ${name} as paid`, { exact: true })).toBeVisible()
    await expect(
      page.getByText(`Next payment ${next.format('MMM D, YYYY')}.`, { exact: true })
    ).toBeVisible()
    await expect(payment.getByText('Paid', { exact: true })).toBeVisible()
    const saved = await request.get(subscriptionPath)
    expect(saved.ok()).toBe(true)
    expect((await saved.json()).next_payment_date).toBe(next.format('YYYY-MM-DD'))
  })

  await test.step('skip the following payment from the next calendar month; the schedule advances past it', async () => {
    await page.getByRole('button', { name: /Next month/i }).click()
    await page
      .getByRole('button', { name: new RegExp(`^${next.format('dddd, MMMM D')},.*payment`) })
      .click()
    const panel = page.getByRole('complementary', { name: next.format('dddd, MMMM D') })
    await panel.getByRole('button', { name: `Skip payment for ${name}`, exact: true }).click()
    await expect(page.getByText(`Skipped ${name}`, { exact: true })).toBeVisible()
    await expect(panel.getByText('Skipped', { exact: true })).toBeVisible()
    // A skipped outcome on the current due date advances the schedule one more period.
    const saved = await request.get(subscriptionPath)
    expect((await saved.json()).next_payment_date).toBe(next.add(1, 'month').format('YYYY-MM-DD'))
  })

  await test.step('cancel with a reason, then delete permanently', async () => {
    await page.getByRole('link', { name: 'Subscriptions', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeFocused()
    await page.getByRole('button', { name: `More actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Cancel subscription', exact: true }).click()
    const cancel = page.getByRole('dialog', { name: 'Cancel subscription', exact: true })
    await cancel.getByRole('button', { name: 'Too expensive', exact: true }).click()
    await cancel.getByRole('button', { name: 'Cancel subscription', exact: true }).click()
    await expect(cancel).not.toBeVisible()
    const cancelled = page.getByRole('region', { name: 'Cancelled subscriptions', exact: true })
    await cancelled.getByRole('button', { name: /Cancelled subscriptions/ }).click()
    const row = cancelled.getByRole('listitem').filter({ hasText: name })
    await expect(row).toContainText('Reason: Too expensive')
    await row.getByRole('button', { name: `Delete ${name}`, exact: true }).click()
    await page
      .getByRole('dialog', { name: `Delete ${name}?`, exact: true })
      .getByRole('button', { name: 'Delete subscription', exact: true })
      .click()
    await expect(row).toHaveCount(0)
    expect((await request.get(subscriptionPath)).status()).toBe(404)
  })

  await test.step('restore a backup without reloading the page', async () => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeFocused()
    await expect(
      page.getByRole('button', { name: 'Edit Restored category', exact: true })
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Restored tag', exact: true })).toHaveCount(
      0
    )
    await expect(page.getByRole('button', { name: 'Edit Restored card', exact: true })).toHaveCount(
      0
    )
    await page.getByRole('button', { name: 'Import data', exact: true }).click()
    const chooserPromise = page.waitForEvent('filechooser')
    await page
      .getByRole('dialog', { name: 'Import data' })
      .getByRole('button', { name: /^Restore a backup/ })
      .click()
    const chooser = await chooserPromise
    await chooser.setFiles(
      fileURLToPath(new URL('./fixtures/restore-backup.json', import.meta.url))
    )
    const imported = successfulWrite(page, 'POST', '/api/import')
    await page
      .getByRole('dialog', { name: 'Restore this backup?', exact: true })
      .getByRole('button', { name: 'Restore backup', exact: true })
      .click()
    await imported
    await expect(
      page.getByRole('button', { name: 'Edit Restored category', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Restored tag', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Edit Restored card', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Monthly budget', exact: true })).toHaveValue(
      '55'
    )
    await expect(page.getByRole('button', { name: 'Default currency', exact: true })).toContainText(
      'EUR'
    )
    await page.getByRole('link', { name: 'Subscriptions', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeFocused()
    const restored = page.getByRole('listitem').filter({ hasText: 'Restored subscription' })
    await expect(restored).toContainText('Restored category')
    await expect(restored).toContainText('Restored tag')
    await restored.getByRole('button', { name: 'Edit Restored subscription', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Edit Restored subscription', exact: true })
    await expect(form.getByRole('combobox', { name: 'Payment card', exact: true })).toContainText(
      'Restored card'
    )
  })
})
