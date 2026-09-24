// Where things are, which is the one question jsdom cannot be asked. Each of
// these was written in AGENTS.md as "a question for the deploy preview".

import { expect, test } from '@playwright/test'
import { messageBox, openBoard } from './board'

test.describe('on a phone held upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // Six arrows and the tools leave a portrait phone almost no room for the
  // tabs; paging reaches either end too.
  test('drops the arrows that go all the way to either end of the tabs', async ({ page }) => {
    await openBoard(page)
    await expect(page.locator('.filter-arrow-end').first()).toBeHidden()
    await expect(page.locator('.filter-arrow:not(.filter-arrow-end)').first()).toBeVisible()
  })

  test('never scrolls sideways', async ({ page }) => {
    await openBoard(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.emergency-bar')).toBeInViewport()
  })
})

test.describe('on a short screen', () => {
  test.use({ viewport: { width: 1024, height: 640 } })

  // A nudge repeats while it is held and the ends reach either end in one
  // dwell, so the page controls are room a short screen has better use for.
  test('drops the grid rail’s page controls', async ({ page }) => {
    await openBoard(page)
    await expect(page.locator('.scroll-btn-page').first()).toBeHidden()
  })
})

// It grows from one line to its cap as what is in it grows — measured, since
// a line is however many characters fit at this size and width.
test('grows the message box with what is in it', async ({ page }) => {
  await openBoard(page)
  const before = await messageBox(page).evaluate(el => el.getBoundingClientRect().height)
  await messageBox(page).fill('A message long enough to need more than the one line the box starts at. '.repeat(3))
  const after = await messageBox(page).evaluate(el => el.getBoundingClientRect().height)
  expect(after).toBeGreaterThan(before)
})

// The three modes ride the top border of the message box, centred on it.
test('rides the mode strip on the message box’s top border', async ({ page }) => {
  await openBoard(page)
  const apart = await page.evaluate(() => {
    const strip = document.querySelector('.topbar-modes')!.getBoundingClientRect()
    const box = document.querySelector('.text-display')!.getBoundingClientRect()
    return Math.abs((strip.top + strip.bottom) / 2 - box.top)
  })
  expect(apart).toBeLessThan(3)
})
