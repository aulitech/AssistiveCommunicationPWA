// Building a message out of phrases, in a real browser.
//
// The reason this is here and not only in jsdom: **Chrome puts an unfocused text
// box's caret back to the start** when a category tab is rested on, with no
// event and no call on the box. jsdom keeps it, so the tests there passed while
// the second phrase went in before the first.

import { expect, test } from '@playwright/test'
import { categories, cell, composing, messageBox, openBoard, tab } from './board'

test('keeps the tabs after a phrase is chosen', async ({ page }) => {
  await openBoard(page, { phrases: categories(['Greetings']) })
  await composing(page)
  await tab(page, 'Library').click()

  await cell(page, 'Once in a blue moon').click()

  await expect(messageBox(page)).toHaveValue('Once in a blue moon')
  await expect(tab(page, 'Greetings')).toBeVisible()
})

test('builds a sentence from two categories, both phrases whole and in order', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Greetings']) })
  await composing(page)
  await tab(page, 'Library').click()
  await cell(page, 'Once in a blue moon').click()

  await tab(page, 'Greetings').click()
  const second = page.locator('.phrase-cell').first()
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
  await composing(page)
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
