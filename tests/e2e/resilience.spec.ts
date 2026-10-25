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

// **A newer Peri is offered to a copy already open**, when it is looked at
// again — and Update now reloads into it. It was found only on opening, so an
// iPad left on the board for days ran the release it was opened on. Without the
// service worker, which would answer the ask itself and leave nothing to stand
// in for.
test.describe('a newer version', () => {
  test.use({ serviceWorkers: 'block' })
  test('offers a newer version to an open copy, and reloads into it when chosen', async ({ page }) => {
    const { errors } = await openBoard(page)
    await expect(page.locator('.update-offer')).toHaveCount(0)

    // The page as a newer release would serve it: another script named in it.
    const root = (url: URL) => url.pathname === '/'
    await page.route(root, async (route, request) => {
      if (request.resourceType() !== 'fetch') return route.continue()
      const res = await route.fetch()
      const html = (await res.text()).replace(/\/assets\/index-[^"]+\.js/, '/assets/index-newer.js')
      await route.fulfill({ response: res, body: html })
    })
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.locator('.update-offer')).toBeVisible()

    await page.unroute(root)
    // The strip's arrival holds the dwells for a second, as it moves the screen.
    await page.waitForTimeout(1100)
    await Promise.all([page.waitForEvent('load'), page.locator('.update-offer [aria-label="Update now"]').click()])
    await expect(page.locator('.update-offer')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
