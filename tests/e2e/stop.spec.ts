// **Stop, over the whole top row, while anything is being said.** jsdom can say
// it is there; only a browser can say it covers the question, the message and
// the menu, and that it refuses the pointer that rested on Speak — it arrives
// under that pointer, and a gaze that never moved must not stop the words it
// has just asked for.

import { expect, test, type Page } from '@playwright/test'
import { composing, messageBox, openBoard } from './board'

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
const stop = (page: Page) => page.locator('.topbar > .stop-bar')

test('covers the whole top row while a phrase is said, and stops it', async ({ page }) => {
  await talkingUntilStopped(page)
  const { errors } = await openBoard(page)
  const cell = page.locator('.phrase-cell').first()
  await cell.click()
  await expect(stop(page)).toBeVisible()

  // The row's own box, edge to edge.
  const bar = (await stop(page).boundingBox())!
  const row = (await page.locator('.topbar').boundingBox())!
  for (const side of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(bar[side] - row[side]), `${side}: ${JSON.stringify([bar, row])}`).toBeLessThan(1)

  // Nothing of the row answers a pointer: the message and the menu are under it.
  for (const under of ['.text-display', '.menu-btn']) {
    const box = (await page.locator(under).boundingBox())!
    const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.stop-bar'), {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    })
    expect(hit, `${under} answers a pointer under Stop`).toBe(true)
  }

  const before = await cancelled(page)
  await stop(page).click()
  await expect(stop(page)).toHaveCount(0)
  expect(await cancelled(page)).toBeGreaterThan(before)
  // And the row is back as it was, the phrase in the box.
  await expect(messageBox(page)).not.toHaveValue('')
  expect(errors).toEqual([])
})

test('refuses the pointer that rested on Speak, until it is aimed', async ({ page }) => {
  await talkingUntilStopped(page)
  const { errors } = await openBoard(page)
  await composing(page)
  await messageBox(page).fill('Hello there')
  const speak = page.locator('.icon-btn[aria-label="Speak"]')
  const box = (await speak.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(at.x - 40, at.y, { steps: 4 })
  await page.mouse.move(at.x, at.y, { steps: 4 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(stop(page)).toBeVisible()

  // Still resting where Speak was, past any dwell, and pressed again there.
  const before = await cancelled(page)
  await page.mouse.move(at.x + 1, at.y)
  await page.waitForTimeout(2_000)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(100)
  await expect(stop(page), 'Stop answered a pointer it arrived under').toBeVisible()
  expect(await cancelled(page)).toBe(before)

  // Aimed at it, it stops.
  await page.mouse.move(at.x - 120, at.y + 10, { steps: 6 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(stop(page)).toHaveCount(0)
  expect(await cancelled(page)).toBeGreaterThan(before)
  expect(errors).toEqual([])
})
