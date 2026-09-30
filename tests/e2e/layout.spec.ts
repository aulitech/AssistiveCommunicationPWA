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

  // The toast is ringed by a wide border. Placed at the middle, it used to
  // shrink to the half of the screen right of that, which on a phone left the
  // words five lines of two.
  test('gives the toast the width of the table, less a gutter', async ({ page }) => {
    await openBoard(page)
    // The microphone's area answers over the edit toggle at this width, so the
    // click goes to the toggle itself.
    await page.locator('.edit-toggle').dispatchEvent('click')
    const toast = page.locator('.toast')
    await expect(toast).toBeVisible()
    const { left, right, table, border, lines } = await toast.evaluate(el => {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        left: r.left,
        right: r.right,
        table: document.querySelector('.grid-wrapper')!.getBoundingClientRect().right,
        border: parseFloat(style.borderTopWidth),
        lines: Math.round(
          (r.height - 2 * parseFloat(style.borderTopWidth)) / parseFloat(style.lineHeight || '24'),
        ),
      }
    })
    // 1.3rem, which Chrome draws on a whole pixel.
    expect(Math.abs(border - 1.3 * 16)).toBeLessThan(1)
    expect(left).toBeGreaterThanOrEqual(15)
    expect(right).toBeLessThanOrEqual(table - 15)
    expect(right - left).toBeGreaterThan(280)
    expect(lines).toBeLessThanOrEqual(3)
  })

  // Getting started stands where the box, the tabs and the grid are: down to
  // the emergency bar and no further, and no wider than the phone.
  test('opens Getting started on signing in, above the emergency bar', async ({ page }) => {
    await page.goto('/')
    await page.locator('.auth-btn[aria-label="Continue as guest"]').click()
    await expect(page.locator('.introduction')).toBeVisible()

    const { introduction, bar, overflow } = await page.evaluate(() => ({
      introduction: document.querySelector('.introduction')!.getBoundingClientRect().bottom,
      bar: document.querySelector('.emergency-bar')!.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(Math.abs(introduction - bar)).toBeLessThan(1)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.emergency-bar')).toBeInViewport()
    await expect(page.locator('.introduction .panel-btn[aria-label="Start"]')).toBeInViewport()
  })
})

// Wide enough for both, Getting started takes the left half and the board works
// in the right, down to the emergency bar.
test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test('puts Getting started beside the board, half each', async ({ page }) => {
    await page.goto('/')
    await page.locator('.auth-btn[aria-label="Continue as guest"]').click()
    await expect(page.locator('.introduction')).toBeVisible()
    await expect(page.locator('.text-display')).toBeVisible()

    const { introduction, board, bar, overflow } = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      return {
        introduction: box('.introduction'),
        board: box('.board-column'),
        bar: box('.emergency-bar'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(introduction.left).toBe(0)
    expect(Math.abs(introduction.width - 700)).toBeLessThan(1)
    expect(Math.abs(board.left - introduction.right)).toBeLessThan(1)
    expect(Math.abs(board.right - 1400)).toBeLessThan(1)
    for (const half of [introduction, board]) expect(Math.abs(half.bottom - bar.top)).toBeLessThan(1)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.phrase-cell').first()).toBeInViewport()
  })
})

// Where a gaze working the board already is, rather than a corner.
test('puts the toast in the upper third of the phrase table, across its middle', async ({ page }) => {
  await openBoard(page)
  await page.locator('.edit-toggle').dispatchEvent('click')
  await expect(page.locator('.toast')).toBeVisible()
  const { toast, table } = await page.evaluate(() => ({
    toast: document.querySelector('.toast')!.getBoundingClientRect().toJSON(),
    table: document.querySelector('.grid-wrapper')!.getBoundingClientRect().toJSON(),
  }))
  const middle = { x: toast.left + toast.width / 2, y: toast.top + toast.height / 2 }
  expect(middle.y).toBeGreaterThan(table.top)
  expect(middle.y).toBeLessThan(table.top + table.height / 3)
  expect(Math.abs(middle.x - (table.left + table.width / 2))).toBeLessThan(1)
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
