// **The speaking tab** in a real browser: opened by a click from the menu, kept
// in step with the board over a real `BroadcastChannel`, and playing an
// ElevenLabs clip in place of the board — see docs/decisions/speaking-into-a-call.md.
// jsdom has its own stand-in for the channel; this is the one that ships.

import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { categories, cell, openBoard, tab } from './board'

/** A second of silence as WAV, standing in for what ElevenLabs sends back. */
function wav(): Buffer {
  const rate = 8000
  const n = rate
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  return buf
}

/** Every clip a page plays, counted once the browser has started it — in every tab. */
const countPlays = (context: BrowserContext) =>
  context.addInitScript(() => {
    const w = window as unknown as { plays: number }
    w.plays = 0
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      return play.call(this).then(() => void w.plays++)
    }
  })
const plays = (page: Page) => page.evaluate(() => (window as unknown as { plays: number }).plays)

const phrases = categories(['Speaking'])

/** Opens the speaking tab the way somebody would: the menu, and a click on its item. */
async function openSpeakingTab(page: Page) {
  await page.locator('.icon-btn[aria-label*="menu" i]').click()
  const [speaking] = await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('.nav-item[aria-label="Speaking tab"]').click(),
  ])
  await expect(speaking.locator('.speaking-said')).toHaveText('What Peri says will appear here.')
  await page.bringToFront()
  // The menu closes behind it; the board is deaf for a second after.
  await expect(page.locator('.top-panel')).not.toHaveClass(/\bopen\b/)
  await page.waitForTimeout(1100)
  return speaking
}

test('shows what is said on the board, and only that', async ({ page }) => {
  await openBoard(page, { phrases })
  const speaking = await openSpeakingTab(page)
  expect(new URL(speaking.url()).pathname).toBe('/speaking')

  await tab(page, 'Speaking').click()
  await cell(page, 'First in Speaking').click()
  await expect(speaking.locator('.speaking-said')).toHaveText('First in Speaking')
  await expect(speaking.locator('.phrase-cell')).toHaveCount(0)
})

test('plays an ElevenLabs clip in the speaking tab rather than on the board', async ({ page, context }) => {
  await context.route('https://api.elevenlabs.io/**', route =>
    route.fulfill({ status: 200, contentType: 'audio/mpeg', body: wav() }),
  )
  await context.addInitScript(() => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-e2e', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
  })
  await countPlays(context)
  await openBoard(page, { phrases })
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}')
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ ...settings, voiceURI: 'elevenlabs:v1' }))
  })
  await page.reload()

  const speaking = await openSpeakingTab(page)
  await tab(page, 'Speaking').click()
  await cell(page, 'Second in Speaking').click()

  await expect(speaking.locator('.speaking-said')).toHaveText('Second in Speaking')
  await expect.poll(() => plays(speaking), 'the tab did not play the clip').toBe(1)
  expect(await plays(page), 'the board played the clip as well as the tab').toBe(0)
})
