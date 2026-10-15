// A click that lands on something which came to the pointer rather than being
// aimed at — the screen moved under a pointer at rest. On the device this app
// is for, a gaze rig sends a real click where it rests, so the click *is* the
// dwell: answering it speaks a phrase nobody chose.
//
// jsdom cannot ask what is under a point, so this is the only place the guard
// in `ui/dwell.ts` (`cameToPointer`) can be seen working.

import { expect, test } from '@playwright/test'
import { instantSpeech, messageBox, openBoard, tab } from './board'

test('refuses a click on a cell scrolled under a resting pointer, until it is aimed', async ({ page }) => {
  await openBoard(page)

  const first = page.locator('.phrase-cell').first()
  const box = (await first.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // Rested there, as a gaze would: arrived by moving, then still.
  await page.mouse.move(at.x - 60, at.y, { steps: 4 })
  await page.mouse.move(at.x, at.y, { steps: 4 })

  // The list moves under it — a cell that was not aimed at is under the pointer.
  await page.evaluate(() => {
    const grid = document.querySelector('.grid-wrapper')!
    grid.scrollTop += 400
  })
  await page.waitForTimeout(200)
  const arrived = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.phrase-cell')?.textContent,
    at,
  )
  expect(arrived, 'nothing new came under the pointer').toBeTruthy()

  // Resting on it chooses nothing — past any dwell time the board starts with.
  await page.mouse.move(at.x + 1, at.y)
  await page.waitForTimeout(2_500)
  await expect(messageBox(page), 'a rest on a cell that came to the pointer was answered').toHaveValue('')

  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(100)
  await expect(messageBox(page), 'a click on a cell that came to the pointer was answered').toHaveValue('')

  // Aimed: the pointer moves across the cell, and the same click is answered.
  await page.mouse.move(at.x + 31, at.y, { steps: 4 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(messageBox(page)).not.toHaveValue('')
})

// The pause after choosing, on its real default: a second click straight after
// the first is ignored, and one after the pause is taken.
test('ignores a second phrase clicked straight after the first, and takes it after a second', async ({ page }) => {
  // The pause alone, not the lock while the first is being said.
  await instantSpeech(page)
  const { errors } = await openBoard(page, { pause: true })
  const cells = page.locator('.phrase-cell')
  const first = cells.nth(0)
  const second = cells.nth(1)
  const words = [(await first.textContent())!.trim(), (await second.textContent())!.trim()]
  // The board opens in auto-speak, and what was said last is marked.
  const said = page.locator('.phrase-cell[aria-current="true"]')
  await first.click()
  await second.click()
  // Given the moment a taken click would need to show, and still the first.
  await page.waitForTimeout(300)
  expect(await said.textContent()).toBe(words[0])
  await page.waitForTimeout(1_100)
  await second.click()
  await expect(said).toHaveText(words[1])
  expect(errors).toEqual([])
})

// Auto-speak puts the phrase it said in the message box. A long one grows the
// box onto more lines and pushes the grid down under the pointer that chose it,
// and the cell that lands there must not be said by a gaze that never moved.
test('says nothing more when a long phrase said grows the box under a resting pointer', async ({ page }) => {
  const LONG = Array.from({ length: 6 }, (_, i) => `this is part ${i + 1} of a very long phrase that wraps`).join(
    ', ',
  )
  // In a category of its own, on its second row, with a row of others above it.
  const others = Array.from({ length: 30 }, (_, i) => ({
    id: `other-${i}`,
    text: `Another phrase ${i + 1}`,
    category: 'Long',
  }))
  const { errors } = await openBoard(page, {
    phrases: [...others.slice(0, 8), { id: 'long', text: LONG, category: 'Long' }, ...others.slice(8)],
  })
  await tab(page, 'Long').click()
  const said = page.locator('.phrase-cell[aria-current="true"]')
  const long = page.locator('.phrase-cell').filter({ hasText: 'this is part 1' }).first()
  await expect(long).toBeVisible()
  const before = (await messageBox(page).boundingBox())!.height

  // Rested near its top edge, as a gaze would: arrived by moving, then still,
  // until it is said. Pushed down, the grid brings the row above under it.
  const box = (await long.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + 6 }
  await page.mouse.move(at.x - 60, at.y, { steps: 4 })
  await page.mouse.move(at.x, at.y, { steps: 4 })
  await expect(said).toContainText('this is part 1', { timeout: 5_000 })
  await expect(messageBox(page)).toHaveValue(LONG)

  // The box grew and the grid moved: something else is under the pointer now.
  expect((await messageBox(page).boundingBox())!.height, 'the box did not grow').toBeGreaterThan(before)
  const arrived = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.phrase-cell')?.textContent ?? '',
    at,
  )
  expect(arrived, 'the grid did not move under the pointer').not.toContain('this is part 1')

  // Resting on, past any dwell time the board starts with, says nothing more.
  await page.mouse.move(at.x + 1, at.y)
  await page.waitForTimeout(2_500)
  await expect(said, 'a cell that came to the pointer was said').toContainText('this is part 1')
  expect(errors).toEqual([])
})
