// Writing and rewording phrases in a real browser: where a new phrase goes, and
// whether the board shows it — which is a question about where things are on
// screen, and so one jsdom cannot answer.

import { expect, test } from '@playwright/test'
import {
  activeTab,
  cell,
  composing,
  draftCategory,
  editMode,
  fileUnder,
  marked,
  messageBox,
  offCentre,
  openBoard,
  tab,
  within,
} from './board'

test('files a new phrase under the tab edit mode was entered on', async ({ page }) => {
  const { errors } = await openBoard(page)
  await tab(page, 'Food').click()
  await editMode(page)

  await expect(draftCategory(page)).toHaveText('Food')
  expect(errors).toEqual([])
})

/**
 * Filed elsewhere, the board goes there, marks the cell, scrolls it into view
 * and brings the tab to the middle of the bar — Food sits far enough along
 * forty-odd tabs that the bar has to scroll to centre it.
 */
test('takes the board to a new phrase filed elsewhere, and shows it', async ({ page }) => {
  const { errors } = await openBoard(page)
  await tab(page, 'ALS').click()
  await editMode(page)
  await messageBox(page).fill('One for over there')
  await fileUnder(page, 'Food')
  await page.locator('.icon-btn[aria-label="Save phrase"]').click()

  await expect(activeTab(page)).toHaveText('Food')
  await expect(marked(page)).toHaveText('One for over there')
  // Both scrolls are smooth, so asked until they settle.
  await expect.poll(() => within(page, '.phrase-cell[aria-current="true"]', '.grid-wrapper')).toBe(true)
  await expect
    .poll(() => offCentre(page, '.filter-tab[aria-selected="true"]', '.filter-scroll', 'x'))
    .toBeLessThan(60)
  expect(errors).toEqual([])
})

// All holds two and a half thousand phrases and the grid renders the first
// hundred and twenty, and a new one lands at the end — past what is rendered
// until the window grows to reach it. (A single category fits in the four
// screens the window keeps once it has measured, so it has to be All.)
test('reaches a new phrase past the end of what is rendered', async ({ page }) => {
  await openBoard(page)
  await expect(page.locator('.phrase-cell')).toHaveCount(120)
  await editMode(page)
  await messageBox(page).fill('One at the very end')
  await page.locator('.icon-btn[aria-label="Save phrase"]').click()

  await expect(marked(page)).toHaveText('One at the very end')
  await expect.poll(() => within(page, '.phrase-cell[aria-current="true"]', '.grid-wrapper')).toBe(true)
})

test('opens the phrase in the message box, under its own category', async ({ page }) => {
  const { errors } = await openBoard(page)
  await composing(page)
  await cell(page, 'Once in a blue moon').first().click()
  await editMode(page)

  await expect(activeTab(page)).toHaveText('Idioms')
  await expect(page.locator('.edit-bar-title')).toHaveText('Editing phrase')
  await expect(marked(page)).toHaveText('Once in a blue moon')
  expect(errors).toEqual([])
})

test('puts a deleted phrase back where it was', async ({ page }) => {
  await openBoard(page)
  await editMode(page)
  const target = page.locator('.phrase-cell').nth(2)
  const text = (await target.innerText()).trim()
  await target.click()
  await page.locator('.icon-btn[aria-label="Delete phrase"]').click()
  await expect(cell(page, text)).toHaveCount(0)

  await page.locator('.topbar-clear .icon-btn').click()

  await expect(cell(page, text)).toHaveCount(1)
  await expect(messageBox(page)).toHaveValue(text)
})

test('moves between categories in edit mode, and renames with the pencil', async ({ page }) => {
  await openBoard(page)
  await editMode(page)
  await expect(page.locator('.rename-category-tab')).toHaveAttribute('aria-disabled', 'true')

  await tab(page, 'Food').click()

  await expect(activeTab(page)).toHaveText('Food')
  await expect(draftCategory(page)).toHaveText('Food')
  await expect(page.locator('.edit-modal')).toHaveCount(0)
  await page.locator('.rename-category-tab').click()
  await expect(page.locator('.edit-modal')).toHaveAttribute('aria-label', 'Rename category')
})
