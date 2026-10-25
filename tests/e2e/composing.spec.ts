// Building a message out of phrases, in a real browser — in edit mode, the one
// place a phrase goes in at the caret.
//
// The reason this is here and not only in jsdom: **Chrome puts an unfocused text
// box's caret back to the start** when a category tab is rested on, with no
// event and no call on the box. jsdom keeps it, so the tests there passed while
// the second phrase went in before the first.

import { expect, test } from '@playwright/test'
import { categories, cell, editMode, messageBox, openBoard, tab } from './board'

test('keeps the tabs after a phrase is chosen', async ({ page }) => {
  await openBoard(page, { phrases: categories(['Greetings']) })
  await editMode(page)
  // The board opens on Library, where every phrase is.

  await cell(page, 'Once in a blue moon').click()

  await expect(messageBox(page)).toHaveValue('Once in a blue moon')
  await expect(tab(page, 'Greetings')).toBeVisible()
})

test('builds a sentence from two categories, both phrases whole and in order', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Greetings']) })
  await editMode(page)
  // The board opens on Library, where every phrase is.
  await cell(page, 'Once in a blue moon').click()
  // Changed — a space after it — so the board can be chosen from again.
  await messageBox(page).press('End')
  await page.keyboard.type(' ')

  await tab(page, 'Greetings').click()
  // Past the phrase open in the box, which, changed, is shown first on a tab
  // that does not hold it.
  const second = page.locator('.phrase-cell:not(.has-tools)').first()
  // The text as written: `innerText` reads empty until Chrome has laid the new
  // tab's cells out, which it may not have yet.
  const text = (await second.textContent())!.trim()
  await second.click()

  await expect(messageBox(page)).toHaveValue(`Once in a blue moon ${text}`)
  expect(errors).toEqual([])
})

// Typed with the keyboard, so the caret the search reads is the one Chrome
// keeps: several words found as a whole, then an acronym after the phrase.
test('finds what is typed in Library, and replaces it with the phrase chosen', async ({ page }) => {
  const { errors } = await openBoard(page)
  await editMode(page)
  // Focused rather than clicked: a pointer left resting on the box is a dwell
  // that puts the caret under it, part-way through what is being typed.
  await messageBox(page).focus()
  await page.keyboard.type('once in a bl')
  await expect(page.locator('.phrase-cell').first()).toHaveText('Once in a blue moon')
  await page.mouse.move(5, 5)
  await cell(page, 'Once in a blue moon').click()
  await expect(messageBox(page)).toHaveValue('Once in a blue moon')

  await messageBox(page).press('End')
  await page.keyboard.type(' ttyl')
  // The narrowed grid lands a cell under the resting pointer, which is refused
  // until the pointer moves — so it moves, as a person's would.
  await page.mouse.move(5, 5)
  await cell(page, 'Talk to you later').click()

  await expect(messageBox(page)).toHaveValue('Once in a blue moon Talk to you later')
  expect(errors).toEqual([])
})

/**
 * **No button takes focus**: the caret stays in the message box whatever is
 * pressed, so the next key typed goes into the message.
 */
test('keeps the caret in the message box when a button is pressed', async ({ page }) => {
  await openBoard(page)
  const box = messageBox(page)
  await box.pressSequentially('Hello')
  for (const label of ['Copy to clipboard', 'Say please at the end of everything spoken']) {
    await page.locator(`[aria-label="${label}"]`).first().click()
    expect(await page.evaluate(() => document.activeElement?.className ?? ''), `${label} took focus`).toContain(
      'text-display',
    )
  }
  await page.keyboard.type(' there')
  await expect(box).toHaveValue('Hello there')
})

/**
 * **Focus is always in a box** — the message's, and put back there with its
 * caret when a panel closes or a press lands on nothing.
 */
test('puts focus back in the message box, caret and all, when it falls to nothing', async ({ page }) => {
  await openBoard(page)
  const box = messageBox(page)
  await box.pressSequentially('Hello')
  // Each step waits out the second the app is deaf for after the screen moves.
  const settle = () => page.waitForTimeout(1100)
  await page.locator('[aria-label="Open menu"]').click()
  await settle()
  await page.locator('.nav-item').filter({ hasText: 'Settings' }).click()
  await settle()
  await page.locator('[aria-label="Back"]').first().click()
  await settle()
  await page.locator('[aria-label="Back"]').first().click()
  await settle()
  await page.mouse.click(5, 300)
  await expect.poll(() => page.evaluate(() => document.activeElement?.className ?? '')).toContain('text-display')
  await page.keyboard.type(' there')
  await expect(box).toHaveValue('Hello there')
})

/**
 * Regression guard, found in a browser. **Switching modes moves the screen
 * under the pointer that switched them**: at this width edit mode brings the
 * language and the voice into the card's row, which grows, so the toggle moves
 * down and the second click follows it there; leaving edit mode shrinks the row
 * again and the message box slides up under the pointer, still resting. Its
 * caret dwell then put the caret where the pointer was — the very start of the
 * words — and everything typed after went in front of what came before.
 */
test('keeps the words in order when the box slides under the pointer that switched modes', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await openBoard(page)
  // Into edit mode and out again, the pointer left where the toggle was.
  await editMode(page)
  await editMode(page)
  const text = 'I would like to go outside this afternoon if the weather stays fine, and could'
  await messageBox(page).pressSequentially(text, { delay: 15 })
  await expect(messageBox(page)).toHaveValue(text)
})

// Auto-speak puts the phrase it said in the box, selected — so the next key
// typed writes over it rather than after it, and the board stays as it was.
test('puts a phrase said in auto-speak in the box, selected, and typing writes over it', async ({ page }) => {
  const { errors } = await openBoard(page)
  const box = messageBox(page)
  await page.locator('.phrase-cell').first().click()
  const said = await box.inputValue()
  expect(said.length, 'nothing went into the box').toBeGreaterThan(0)
  await expect
    .poll(() =>
      box.evaluate(b => [(b as HTMLTextAreaElement).selectionStart, (b as HTMLTextAreaElement).selectionEnd]),
    )
    .toEqual([0, said.length])
  await expect(page.locator('.filter-bar-wrap'), 'the board narrowed to the phrase').toBeVisible()

  await page.keyboard.type('x')
  await expect(box).toHaveValue('x')
  expect(errors).toEqual([])
})

// Turning auto-speak off opens the phrase it said in edit mode; changed — a
// space after it — choosing another builds after it.
test('builds after a phrase auto-speak said once it is turned off', async ({ page }) => {
  const { errors } = await openBoard(page)
  const cells = page.locator('.phrase-cell')
  await cells.nth(0).click()
  const first = await messageBox(page).inputValue()
  await page.locator('.autospeak-toggle').click()
  await messageBox(page).press('End')
  await page.keyboard.type(' ')
  await cells.nth(1).click()
  const both = await messageBox(page).inputValue()
  expect(both.startsWith(first + ' '), `built in front of what was said: ${both}`).toBe(true)
  expect(errors).toEqual([])
})

// Chosen by resting, with no click at all: a dwell fires from a timer, and the
// box was once selected on a timer set beside it, which a real browser could
// run before the box had the phrase — selected one time and not the next.
//
// With the pause after choosing on, as everybody has it: the released code
// left the caret at the end every time there, and selected nothing.
test('selects the phrase auto-speak said when it was chosen by resting, every time', async ({ page }) => {
  test.setTimeout(60_000)
  const { errors } = await openBoard(page, { pause: true })
  const box = messageBox(page)
  for (const n of [0, 1, 2]) {
    const cell = page.locator('.phrase-cell').nth(n)
    const at = (await cell.boundingBox())!
    await page.mouse.move(at.x + at.width / 2 - 40, at.y + at.height / 2, { steps: 4 })
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2, { steps: 4 })
    await expect(box).toHaveValue((await cell.textContent())!.trim(), { timeout: 5_000 })
    await expect
      .poll(() =>
        box.evaluate(b => {
          const t = b as HTMLTextAreaElement
          return [t.selectionStart, t.selectionEnd, t.value.length, document.activeElement === t]
        }),
      )
      .toEqual([0, (await box.inputValue()).length, (await box.inputValue()).length, true])
    // Nothing but Stop answers until it has been said, so the next rest waits.
    await expect(page.locator('.app')).not.toHaveClass(/is-speaking/, { timeout: 10_000 })
  }
  expect(errors).toEqual([])
})

// A link in the box is edited as its text and its address, in fields inside the
// card, and what is typed there is written back into the box.
test('edits a link in the box as its text and its address', async ({ page }) => {
  const { errors } = await openBoard(page)
  const box = messageBox(page)
  await box.fill('Look at https://example.com/menu please')
  const text = page.locator('input[aria-label="Link text"]')
  await expect(text).toBeVisible()
  await expect(page.locator('input[aria-label="Link address"]')).toHaveValue('https://example.com/menu')
  // Inside the card, as every control of the message is.
  const card = (await page.locator('.message-wrap').boundingBox())!
  const field = (await text.boundingBox())!
  expect(field.y + field.height).toBeLessThanOrEqual(card.y + card.height)

  await text.focus()
  await page.keyboard.type('Menu')
  await expect(box).toHaveValue('Look at [Menu](https://example.com/menu) please')
  expect(errors).toEqual([])
})

// **A message said for the first time is shown where it went.** On a board in
// use it was kept in Library and never seen: used once, it sat after every
// phrase used more under Most used, below the first screen — and read as not
// kept at all. Once the words end and the box is cleared, the board marks it
// and scrolls to it.
test('shows a new message where it went in Library, on a board in use', async ({ page }) => {
  const { errors } = await openBoard(page)
  await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.phrase-cell')].slice(0, 40).map(c => c.getAttribute('data-phrase'))
    const at = Date.now() - 100000
    localStorage.setItem(
      'peri_usage',
      JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, { count: 3, at: at + i }]))),
    )
  })
  await page.reload()
  await messageBox(page).click()
  await page.keyboard.type('Zebra crossing at noon')
  await page.locator('.icon-btn[aria-label="Speak"]').click()
  await page.evaluate(() => speechSynthesis.cancel())
  await page.locator('.icon-btn[aria-label="Clear"]').click()

  const marked = page.locator('.phrase-cell[aria-current="true"]')
  await expect(marked).toHaveText('Zebra crossing at noon')
  const index = await page.evaluate(() =>
    [...document.querySelectorAll('.phrase-cell')].findIndex(c => c.textContent === 'Zebra crossing at noon'),
  )
  expect(index, 'not below the phrases used more, so this proves nothing').toBeGreaterThan(30)
  await expect(marked).toBeInViewport({ ratio: 1, timeout: 3000 })
  expect(errors).toEqual([])
})

// **Said with Speak and save, a phrase is first under Recently used.** It was
// saved and never counted as used, so it sat behind every phrase with any use:
// two thousand cells down a board in use.
test('puts a phrase said with Speak and save first under Recently used', async ({ page }) => {
  const { errors } = await openBoard(page)
  await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.phrase-cell')].slice(0, 40).map(c => c.getAttribute('data-phrase'))
    const at = Date.now() - 100000
    localStorage.setItem(
      'peri_usage',
      JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, { count: 3, at: at + i }]))),
    )
    localStorage.setItem('peri_phrase_sort', JSON.stringify({ Library: 'recent' }))
  })
  await page.reload()
  await editMode(page)
  await messageBox(page).click()
  await page.keyboard.type('Zebra crossing at noon')
  await page.locator('.icon-btn[aria-label="Speak and save"]').click()
  await page.evaluate(() => speechSynthesis.cancel())

  await expect(page.locator('.phrase-cell').first()).toHaveText('Zebra crossing at noon')
  await expect(page.locator('.phrase-cell[aria-current="true"]')).toHaveText('Zebra crossing at noon')
  expect(errors).toEqual([])
})
