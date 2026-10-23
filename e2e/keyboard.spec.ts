import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function tabTo(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 80; tabs++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target, 'The control must be reachable using Tab alone').toBeFocused()
}

test('keyboard-only navigation, row menu, creation, shortcuts, and palette', async ({
  page,
}, testInfo) => {
  const name = `Keyboard service ${testInfo.testId}`
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await tabTo(page, page.getByRole('button', { name: 'Search', exact: true }))
  await page.keyboard.press('Tab')
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Dashboard' })
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Subscriptions', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeVisible()

  await page.keyboard.press('n')
  const create = page.getByRole('dialog', { name: 'Add Subscription' })
  await expect(create).toBeVisible()
  await tabTo(page, create.getByRole('searchbox', { name: 'Search services' }))
  await page.keyboard.type('No matching template for keyboard journey')
  await tabTo(page, create.getByRole('button', { name: 'Start from scratch', exact: true }))
  await page.keyboard.press('Enter')
  await tabTo(page, create.getByRole('textbox', { name: /^Name/ }))
  await page.keyboard.type(name)
  await tabTo(page, create.getByRole('spinbutton', { name: /^Amount/ }))
  await page.keyboard.type('14.99')
  await tabTo(page, create.getByRole('button', { name: /Add Subscription/i }))
  await page.keyboard.press('Enter')
  await expect(create).not.toBeVisible()
  // Let the focusable success notification leave before traversing the page again.
  await expect(page.getByText('Subscription added', { exact: true })).toBeHidden({
    timeout: 10_000,
  })

  await tabTo(page, page.getByRole('button', { name: 'List view' }))
  await page.keyboard.press('Enter')
  const more = page.getByRole('button', { name: `More actions for ${name}` })
  await tabTo(page, more)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitem', { name: 'Edit', exact: true }),
    `Opening the menu must focus its first item; active control: ${await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim())}`
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Pin to top' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()

  const trigger = page.getByRole('button', { name: 'Add Subscription', exact: true })
  await tabTo(page, trigger)
  await page.keyboard.press('n')
  await expect(create).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(create).not.toBeVisible()
  await expect(trigger, 'Escape restores focus to the create trigger').toBeFocused()

  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('Settings')
  await expect(palette.getByRole('option', { name: /Settings/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)
})

test('keyboard shortcuts restore focus and navigate through the palette', async ({ page }) => {
  await page.goto('/subscriptions')
  await expect(page.getByRole('heading', { name: 'My Subscriptions', level: 1 })).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Add Subscription', exact: true })
  await tabTo(page, trigger)
  await page.keyboard.press('n')
  const create = page.getByRole('dialog', { name: 'Add Subscription' })
  await expect(create).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(create).not.toBeVisible()
  await expect.soft(trigger, 'Escape restores focus to the create trigger').toBeFocused()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('Settings')
  await expect(palette.getByRole('option', { name: /Settings/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)
})
