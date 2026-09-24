// Building a message out of phrases, in a real browser.
//
// The reason this is here and not only in jsdom: **Chrome puts an unfocused text
// box's caret back to the start** when a category tab is rested on, with no
// event and no call on the box. jsdom keeps it, so the tests there passed while
// the second phrase went in before the first.

import { expect, test } from '@playwright/test'
import { cell, composing, messageBox, openBoard, tab } from './board'

test('keeps the tabs after a phrase is chosen', async ({ page }) => {
  await openBoard(page)
  await composing(page)
  await tab(page, 'Idioms').click()

  await cell(page, 'Once in a blue moon').click()

  await expect(messageBox(page)).toHaveValue('Once in a blue moon')
  await expect(tab(page, 'Appreciation')).toBeVisible()
})

test('builds a sentence from two categories, both phrases whole and in order', async ({ page }) => {
  const { errors } = await openBoard(page)
  await composing(page)
  await tab(page, 'Idioms').click()
  await cell(page, 'Once in a blue moon').click()

  await tab(page, 'Appreciation').click()
  const second = page.locator('.phrase-cell').first()
  const text = (await second.innerText()).trim()
  await second.click()

  await expect(messageBox(page)).toHaveValue(`Once in a blue moon ${text}`)
  expect(errors).toEqual([])
})
