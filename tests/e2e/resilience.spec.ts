// What the board does when something underneath it fails — storage refusing
// writes, a store written by something else — in the browser those failures
// actually happen in.

import { expect, test } from '@playwright/test'
import { editMode, marked, messageBox, openBoard } from './board'

test('keeps working, and says so in a strip that stays, when storage refuses every write', async ({ page }) => {
  const { errors } = await openBoard(page)
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
  })
  await editMode(page)
  await expect(page.locator('.not-keeping')).toContainText('stopped saving')
  // The strip's arrival holds the dwells for a second.
  await page.waitForTimeout(1100)
  await messageBox(page).fill('Written while nothing could be kept')
  await page.locator('.icon-btn[aria-label="Save phrase"]').click()

  await expect(page.locator('.app')).toBeVisible()
  await expect(marked(page)).toHaveText('Written while nothing could be kept')
  // In the flow above the board, not laid over it.
  const stripAbove = await page.evaluate(() => {
    const strip = document.querySelector('.not-keeping')!.getBoundingClientRect()
    const bar = document.querySelector('.topbar')!.getBoundingClientRect()
    return strip.bottom <= bar.top + 1
  })
  expect(stripAbove).toBe(true)
  expect(errors).toEqual([])
})

// A phrase whose words were not words reached the parser while the board was
// drawn, and threw on every load — found by trying exactly this.
test('opens the board over a damaged phrase store', async ({ page }) => {
  const { errors } = await openBoard(page, {
    phrases: [{ id: 'custom-broken', text: 123 as unknown as string, category: 'Food' }],
  })

  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('.still-talking')).toHaveCount(0)
  expect(errors).toEqual([])
})
