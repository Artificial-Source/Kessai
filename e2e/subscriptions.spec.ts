import { test, expect, openNewSubscriptionForm } from './fixtures'

test.describe('Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subscriptions')
    await expect(page.getByRole('heading', { name: /my subscriptions/i })).toBeVisible()
  })

  test('should show empty state when no subscriptions exist @web-only', async ({ page }) => {
    await expect(page.getByText(/no subscriptions yet/i)).toBeVisible()
  })

  test('should open add subscription dialog', async ({ page }) => {
    const dialog = await openNewSubscriptionForm(page)

    // Form fields should be present after choosing to start from scratch
    await expect(dialog.getByLabel(/^name/i)).toBeVisible()
    await expect(dialog.getByLabel(/^amount/i)).toBeVisible()
  })

  test('should close dialog on cancel', async ({ page }) => {
    // Open dialog
    await page.getByRole('button', { name: /add subscription/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('should show view controls when subscriptions exist', async ({ page }) => {
    // Initially empty — add a subscription via the form
    await openNewSubscriptionForm(page)

    // Fill the form
    await page.getByLabel(/name/i).fill('Netflix')
    await page.getByLabel(/amount/i).fill('15.99')

    // Submit
    await page.getByRole('button', { name: /save|add|create/i }).click()

    // Wait for dialog to close and view controls to appear
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // View toggle buttons should be visible
    await expect(page.getByRole('button', { name: /grid view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /list view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /bento view/i })).toBeVisible()
  })

  test('should filter subscriptions by search', async ({ page }, testInfo) => {
    const names = [`Search match ${testInfo.testId}`, `Another service ${testInfo.testId}`]
    for (const name of names) {
      const dialog = await openNewSubscriptionForm(page)
      await dialog.getByRole('textbox', { name: /^Name/ }).fill(name)
      await dialog.getByRole('spinbutton', { name: /^Amount/ }).fill('9.99')
      await dialog.getByRole('button', { name: 'Add Subscription', exact: true }).click()
      await expect(dialog).not.toBeVisible()
    }
    await page.getByRole('searchbox', { name: 'Search subscriptions' }).fill('Search match')
    await expect(page.getByRole('button', { name: `More actions for ${names[0]}` })).toBeVisible()
    await expect(page.getByRole('button', { name: `More actions for ${names[1]}` })).toHaveCount(0)
  })
})
