// Presentation mode in a real browser, with a real second window — what jsdom
// cannot open. See docs/decisions/presentation-mode.md.

import { expect, test } from '@playwright/test'
import { openBoard } from './board'

// A camera that is a test pattern and a microphone that is a tone, and
// permission to use both without asking.
test.use({
  permissions: ['camera', 'microphone'],
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

// Captions: the lower third of the window, the newest at its foot, what came
// before scrolled up out of the band as more is said.
test('shows what is said in the lower third, scrolling up as more is said', async ({ page }) => {
  const { errors } = await openBoard(page)
  const [win] = await Promise.all([page.waitForEvent('popup'), page.locator('.present-toggle').click()])
  await win.setViewportSize({ width: 1200, height: 720 })
  await expect(win.locator('.presentation-waiting')).toBeVisible()

  const say = (text: string) =>
    win.evaluate(t => (window as unknown as { periStage: { show: (t: string) => void } }).periStage.show(t), text)
  // One line, short of a full band, still sits at its foot.
  await say('Hello')
  const one = await win.evaluate(() => {
    const band = document.querySelector('.presentation-said')!.getBoundingClientRect()
    const line = document.querySelector('.presentation-latest')!.getBoundingClientRect()
    return band.bottom - line.bottom
  })
  expect(one, 'a single line floated to the top of the band').toBeLessThan(40)

  for (let n = 1; n <= 12; n++)
    await say(`Line ${n} of what was said, long enough to want a second line in the band`)
  await expect(win.locator('.presentation-latest')).toContainText('Line 12')

  const band = win.locator('.presentation-said')
  // Smooth, so it is waited out rather than read mid-scroll.
  await expect
    .poll(() => band.evaluate(b => b.scrollHeight - b.clientHeight - b.scrollTop), { timeout: 5_000 })
    .toBeLessThanOrEqual(1)
  const where = await win.evaluate(() => {
    const band = document.querySelector('.presentation-said')!
    const box = band.getBoundingClientRect()
    const latest = document.querySelector('.presentation-latest')!.getBoundingClientRect()
    const button = document.querySelector('.presentation-camera-toggle')!.getBoundingClientRect()
    return {
      band: [box.top, box.bottom, box.left, box.right],
      latest: [latest.top, latest.bottom],
      scrolled: band.scrollTop,
      button: [button.left, button.right],
      height: innerHeight,
    }
  })
  expect(where.band[0]).toBeCloseTo((where.height * 2) / 3, 0)
  expect(where.band[1]).toBeCloseTo(where.height, 0)
  expect(where.scrolled, 'nothing scrolled up').toBeGreaterThan(0)
  // The newest is whole, at the foot of the band.
  expect(where.latest[0]).toBeGreaterThanOrEqual(where.band[0])
  expect(where.latest[1]).toBeLessThanOrEqual(where.band[1])
  // And the camera button is clear of it.
  expect(where.button[0]).toBeGreaterThanOrEqual(where.band[3])
  expect(errors).toEqual([])
})

// The microphone mixed into the window beside Peri's voice, with the browser's
// echo cancellation actually on — asked for is not the same as given.
test('mixes in the microphone with the camera on, echo cancelled', async ({ page }) => {
  const { errors } = await openBoard(page)
  const [win] = await Promise.all([page.waitForEvent('popup'), page.locator('.present-toggle').click()])
  await expect(win.locator('.presentation-mic-toggle')).toHaveCount(0)

  await win.locator('.presentation-camera-toggle').click()
  await expect(win.locator('video.presentation-camera')).toBeVisible()
  // The microphone arrives above the camera, never where the pointer that
  // turned the camera on is resting.
  const camera = await win.locator('.presentation-camera-toggle').boundingBox()
  const mic = await win.locator('.presentation-mic-toggle').boundingBox()
  expect(mic!.y + mic!.height, 'the microphone landed under the pointer').toBeLessThanOrEqual(camera!.y)
  await win.locator('.presentation-mic-toggle').click()
  await expect(win.locator('.presentation-mic-toggle')).toHaveClass(/active/)

  const heard = await win.evaluate(async () => {
    const out = document.querySelector<HTMLAudioElement>('audio.presentation-heard')!
    for (let i = 0; i < 50 && out.paused; i++) await new Promise(r => setTimeout(r, 100))
    const track = (out.srcObject as MediaStream | null)?.getAudioTracks()[0]
    return { playing: !out.paused, live: track?.readyState, echo: track?.getSettings().echoCancellation }
  })
  expect(heard).toEqual({ playing: true, live: 'live', echo: true })

  // The camera going takes the microphone with it.
  await win.locator('.presentation-camera-toggle').click()
  await expect(win.locator('.presentation-mic-toggle')).toHaveCount(0)
  expect(
    await win.evaluate(() => document.querySelector<HTMLAudioElement>('audio.presentation-heard')!.srcObject),
  ).toBeNull()
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
