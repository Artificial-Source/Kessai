import dayjs from 'dayjs'
import type { Page } from '@playwright/test'
import { test, expect, seedSubscriptions } from './fixtures'

const today = dayjs().format('YYYY-MM-DD')

/** The dialog mounts lazily; give a stale one time to appear before asserting there is none. */
async function expectNoDialog(page: Page) {
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function goToRail(page: Page, name: string, heading: string) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true })
    .click()
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

test.describe('Subscription dialog outside the Subscriptions page', () => {
  test('Edit in the calendar day panel opens the subscription', async ({ page }) => {
    await seedSubscriptions(page, [
      { id: 'sub-meal-kit', name: 'Weekly Meal Kit', amount: 64, next_payment_date: today },
    ])
    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()

    await page
      .getByRole('button', { name: new RegExp(`^${dayjs().format('dddd, MMMM D')},.*1 payment`) })
      .click()
    await page.getByRole('button', { name: 'Edit Weekly Meal Kit', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit Weekly Meal Kit' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('Weekly Meal Kit')
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()

    await goToRail(page, 'Subscriptions', 'My Subscriptions')
    await expectNoDialog(page)
  })

  for (const [path, heading] of [
    ['/', 'Dashboard'],
    ['/settings', 'Settings'],
  ] as const) {
    test(`N opens Add Subscription on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()

      await page.keyboard.press('n')
      const dialog = page.getByRole('dialog', { name: 'Add Subscription' })
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(page).toHaveURL(path === '/' ? /\/$/ : /\/settings$/)
    })
  }

  test('the palette Add Subscription action opens the dialog on /settings and saves', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await page.keyboard.type('Add Subscription')
    await palette.getByRole('option', { name: /Add Subscription/ }).click()
    await expect(palette).not.toBeVisible()

    const dialog = page.getByRole('dialog', { name: 'Add Subscription' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Start from scratch', exact: true }).click()
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Pottery Studio Pass')
    await dialog.getByRole('spinbutton', { name: /^Amount/ }).fill('38')
    await dialog.getByRole('button', { name: 'Add Subscription', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('Subscription added', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('navigating away with no dialog open never shows one afterwards', async ({ page }) => {
    await seedSubscriptions(page, [
      { id: 'sub-cloud', name: 'Cloud Vault', amount: 4.99, next_payment_date: today },
    ])
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

    // Open and dismiss the dialog from a route that is not Subscriptions, both ways.
    await page.keyboard.press('n')
    await expect(page.getByRole('dialog', { name: 'Add Subscription' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await goToRail(page, 'Calendar', 'Calendar')
    await page
      .getByRole('button', { name: new RegExp(`^${dayjs().format('dddd, MMMM D')},.*1 payment`) })
      .click()
    await page.getByRole('button', { name: 'Edit Cloud Vault', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Edit Cloud Vault' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    for (const [name, heading] of [
      ['Subscriptions', 'My Subscriptions'],
      ['Settings', 'Settings'],
      ['Dashboard', 'Dashboard'],
      ['Subscriptions', 'My Subscriptions'],
    ] as const) {
      await goToRail(page, name, heading)
      await expectNoDialog(page)
    }
  })

  test('history Back while editing keeps the draft and focus inside the dialog', async ({
    page,
  }) => {
    await seedSubscriptions(page, [
      { id: 'sub-meal-kit', name: 'Weekly Meal Kit', amount: 64, next_payment_date: today },
    ])
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await goToRail(page, 'Calendar', 'Calendar')
    await page
      .getByRole('button', { name: new RegExp(`^${dayjs().format('dddd, MMMM D')},.*1 payment`) })
      .click()
    await page.getByRole('button', { name: 'Edit Weekly Meal Kit', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit Weekly Meal Kit' })
    await expect(dialog).toBeVisible()
    const name = dialog.getByRole('textbox', { name: /^Name/ })
    const amount = dialog.getByRole('spinbutton', { name: /^Amount/ })
    await name.fill('Weekly Meal Kit Plus')
    await amount.fill('')
    await amount.pressSequentially('69')

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    // The page behind the modal is aria-hidden, so read its heading off the DOM.
    await expect(page.locator('main h1')).toHaveText('Dashboard')
    // Give the shell's post-navigation focus move (next frame, or once the lazy page renders)
    // time to run; it must leave the open dialog alone.
    await page.waitForTimeout(500)

    await expect(dialog).toBeVisible()
    await expect(amount).toBeFocused()
    await page.keyboard.type('5')
    await expect(amount).toHaveValue('695')
    await expect(name).toHaveValue('Weekly Meal Kit Plus')
  })
})
