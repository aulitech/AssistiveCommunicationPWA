import { test } from '@playwright/test'
import { openBoard } from './board'
test('repeat', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openBoard(page)
  const d = (await page.locator('.grid-arrow.is-down').boundingBox())!
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 5 })
  const tops: number[] = []
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250)
    tops.push(await page.evaluate(() => Math.round(document.querySelector('.grid-wrapper')!.scrollTop)))
  }
  console.log('TOPS', tops.join(','))
})
