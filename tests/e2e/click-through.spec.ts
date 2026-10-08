// A click that lands on something which came to the pointer rather than being
// aimed at — the screen moved under a pointer at rest. On the device this app
// is for, a gaze rig sends a real click where it rests, so the click *is* the
// dwell: answering it speaks a phrase nobody chose.
//
// jsdom cannot ask what is under a point, so this is the only place the guard
// in `ui/dwell.ts` (`cameToPointer`) can be seen working.

import { expect, test } from '@playwright/test'
import { composing, messageBox, openBoard } from './board'

test('refuses a click on a cell scrolled under a resting pointer, until it is aimed', async ({ page }) => {
  await openBoard(page)
  await composing(page)

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

  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(100)
  await expect(messageBox(page), 'a click on a cell that came to the pointer was answered').toHaveValue('')

  // Aimed: the pointer moves across the cell, and the same click is answered.
  await page.mouse.move(at.x + 30, at.y, { steps: 4 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(messageBox(page)).not.toHaveValue('')
})
