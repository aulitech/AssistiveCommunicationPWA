// **Stop, over the card's row of controls, while anything is being said.** jsdom
// can say it is there; only a browser can say it covers that row from the
// card's top edge to the rule under it and no further — the words left in
// sight — that it rolls down from the top as it opens, and that it refuses a
// pointer it arrives under: a gaze resting on the row when the words start has
// not aimed at Stop, and must not stop the words just asked for.

import { expect, test, type Page } from '@playwright/test'
import { messageBox, openBoard } from './board'

/**
 * A synthesiser that goes on talking until it is cancelled, and counts the
 * cancels. Headless Chromium says nothing at all, which would take Stop away
 * before anything could be asked of it.
 */
async function talkingUntilStopped(page: Page) {
  await page.addInitScript(() => {
    const synth = window.speechSynthesis
    let busy = false
    const w = window as unknown as { cancelled: number; said: string[] }
    w.cancelled = 0
    w.said = []
    Object.defineProperty(synth, 'speaking', { get: () => busy })
    Object.defineProperty(synth, 'pending', { get: () => false })
    synth.speak = (u: SpeechSynthesisUtterance) => {
      busy = true
      w.said.push(u.text)
    }
    synth.cancel = () => {
      busy = false
      w.cancelled++
    }
  })
}

const cancelled = (page: Page) => page.evaluate(() => (window as unknown as { cancelled: number }).cancelled)
const stop = (page: Page) => page.locator('.message-tools > .stop-bar')

test('covers the row of controls down to the rule while a phrase is said, and stops it', async ({ page }) => {
  await talkingUntilStopped(page)
  const { errors } = await openBoard(page)
  const cell = page.locator('.phrase-cell').first()
  await cell.click()
  await expect(stop(page)).toBeVisible()

  // **Rolling down from the top**: clipped from the foot as it arrives, and
  // whole once it has.
  const opening = await stop(page).evaluate(b => getComputedStyle(b).animationName)
  expect(opening).toBe('stopOpen')
  await expect.poll(() => stop(page).evaluate(b => b.getAnimations().length)).toBe(0)

  // Inside the card's edge, from its top to the rule under the row.
  const m = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect().toJSON()
    return { bar: r('.message-tools > .stop-bar'), card: r('.message-wrap'), lines: r('.message-lines') }
  })
  expect(Math.abs(m.bar.top - (m.card.top + 1)), "not at the card's top edge").toBeLessThan(1)
  expect(Math.abs(m.bar.left - (m.card.left + 1)), "not at the card's left edge").toBeLessThan(1)
  expect(Math.abs(m.bar.right - (m.card.right - 1)), "not at the card's right edge").toBeLessThan(1)
  expect(Math.abs(m.bar.bottom - m.lines.top), 'not down to the rule').toBeLessThan(1)

  // The menu is under it; the words are not.
  const under = async (sel: string) => {
    const box = (await page.locator(sel).boundingBox())!
    return page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.stop-bar'), {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    })
  }
  expect(await under('.menu-btn'), 'the menu answers a pointer under Stop').toBe(true)
  expect(await under('.text-display'), 'Stop covers the words').toBe(false)

  const before = await cancelled(page)
  await stop(page).click()
  await expect(stop(page)).toHaveCount(0)
  expect(await cancelled(page)).toBeGreaterThan(before)
  // And the row is back as it was, the phrase in the box.
  await expect(messageBox(page)).not.toHaveValue('')
  expect(errors).toEqual([])
})

test('refuses a pointer it arrives under, until it is aimed', async ({ page }) => {
  await talkingUntilStopped(page)
  const { errors } = await openBoard(page)
  await messageBox(page).fill('Hello there')
  // Resting in the row's open space, between the clipboard and the modes, where
  // Stop is about to come down — and the message said by Enter, the box's own
  // way of doing what Speak does.
  const at = await page.evaluate(() => {
    const left = document.querySelector('.tools-left')!.getBoundingClientRect()
    const modes = document.querySelector('.tools-modes')!.getBoundingClientRect()
    return { x: (left.right + modes.left) / 2, y: (modes.top + modes.bottom) / 2 }
  })
  await page.mouse.move(at.x - 40, at.y, { steps: 4 })
  await page.mouse.move(at.x, at.y, { steps: 4 })
  await messageBox(page).press('Enter')
  await expect(stop(page)).toBeVisible()

  // Still resting where it was, past any dwell, and pressed again there.
  const before = await cancelled(page)
  await page.mouse.move(at.x + 1, at.y)
  await page.waitForTimeout(2_000)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(100)
  await expect(stop(page), 'Stop answered a pointer it arrived under').toBeVisible()
  expect(await cancelled(page)).toBe(before)

  // Aimed at it, it stops.
  await page.mouse.move(at.x + 120, at.y + 5, { steps: 6 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(stop(page)).toHaveCount(0)
  expect(await cancelled(page)).toBeGreaterThan(before)
  expect(errors).toEqual([])
})

// Nothing but Stop and the emergency bar answers while something is being said.
test('refuses everything but Stop and the emergency bar while speaking', async ({ page }) => {
  await talkingUntilStopped(page)
  const { errors } = await openBoard(page)
  const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said.length)
  await page.locator('.phrase-cell').first().click()
  await expect(stop(page)).toBeVisible()
  await expect(page.locator('.app')).toHaveClass(/is-speaking/)

  // Aimed at another phrase and clicked: nothing.
  const other = page.locator('.phrase-cell').nth(2)
  await other.hover()
  await page.mouse.move(10, 10)
  await other.click()
  await page.waitForTimeout(200)
  expect(await said()).toBe(1)

  // The emergency bar is said over it.
  await page.locator('.emergency-btn').first().click()
  await expect.poll(said).toBe(2)
  expect(errors).toEqual([])
})
