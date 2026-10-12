// Presentation mode in a real browser, with a real second window — what jsdom
// cannot open. See docs/decisions/presentation-mode.md.

import { expect, test } from '@playwright/test'
import { openBoard } from './board'

// A camera that is a test pattern, and permission to use it without asking.
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

test('shows what is said in a window of its own, and the camera as large as it fits', async ({ page }) => {
  const { errors } = await openBoard(page)
  const [win] = await Promise.all([page.waitForEvent('popup'), page.locator('.present-toggle').click()])
  win.on('pageerror', e => errors.push(String(e)))
  await expect(win.locator('.presentation-waiting')).toBeVisible()
  await expect(page.locator('.present-toggle')).toHaveAttribute('aria-pressed', 'true')

  // The board opens in auto-speak, so a phrase chosen is a phrase said.
  const cell = page.locator('.phrase-cell').first()
  const words = (await cell.textContent())!.trim()
  await cell.click()
  await expect(win.locator('.presentation-latest')).toHaveText(words)

  // The camera, its shape kept: one side fills the window, the other fits in it.
  await win.setViewportSize({ width: 1200, height: 600 })
  await win.locator('.presentation-camera-toggle').click()
  const video = win.locator('video.presentation-camera')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0)
  const fit = await video.evaluate(v => {
    const el = v as HTMLVideoElement
    const box = el.getBoundingClientRect()
    const scale = Math.min(box.width / el.videoWidth, box.height / el.videoHeight)
    return {
      fit: getComputedStyle(el).objectFit,
      box: [box.width, box.height],
      drawn: [el.videoWidth * scale, el.videoHeight * scale],
      window: [innerWidth, innerHeight],
    }
  })
  expect(fit.fit).toBe('contain')
  expect(fit.box).toEqual(fit.window)
  // As large as possible: it meets the window on one side.
  expect(Math.max(fit.drawn[0] / fit.window[0], fit.drawn[1] / fit.window[1])).toBeCloseTo(1, 2)

  // Closed from its own side, and Peri notices.
  await win.close()
  await expect(page.locator('.present-toggle')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

// A second window on a phone is a tab nobody can share beside the board, and
// the row of modes has no room for one more there.
test('is not offered on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openBoard(page)
  await expect(page.locator('.please-toggle')).toBeVisible()
  await expect(page.locator('.present-toggle')).toHaveCount(0)
})
