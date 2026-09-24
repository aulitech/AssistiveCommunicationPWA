// Writing and rewording phrases in a real browser: where a new phrase goes, and
// whether the board shows it — which is a question about where things are on
// screen, and so one jsdom cannot answer.

import { expect, test } from '@playwright/test'
import {
  activeTab,
  categories,
  cell,
  composing,
  draftCategory,
  editMode,
  fileUnder,
  many,
  marked,
  messageBox,
  offCentre,
  openBoard,
  tab,
  within,
} from './board'

test('files a new phrase under the tab edit mode was entered on', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await tab(page, 'Food').click()
  await editMode(page)

  await expect(draftCategory(page)).toHaveText('Food')
  expect(errors).toEqual([])
})

/**
 * Filed elsewhere, the board goes there, marks the cell, scrolls it into view
 * and brings the tab to the middle of the bar — Category 20 sits far enough
 * along thirty tabs that the bar has to scroll to centre it.
 */
test('takes the board to a new phrase filed elsewhere, and shows it', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: many() })
  await tab(page, 'Category 01').click()
  await editMode(page)
  await messageBox(page).fill('One for over there')
  await fileUnder(page, 'Category 20')
  await page.locator('.icon-btn[aria-label="Save phrase"]').click()

  await expect(activeTab(page)).toHaveText('Category 20')
  await expect(marked(page)).toHaveText('One for over there')
  // Both scrolls are smooth, so asked until they settle.
  await expect.poll(() => within(page, '.phrase-cell[aria-current="true"]', '.grid-wrapper')).toBe(true)
  await expect
    .poll(() => offCentre(page, '.filter-tab[aria-selected="true"]', '.filter-scroll', 'x'))
    .toBeLessThan(60)
  expect(errors).toEqual([])
})

// All holds over two thousand phrases and the grid renders the first hundred
// and twenty, and a new one lands at the end — past what is rendered until the
// window grows to reach it.
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

  await expect(activeTab(page)).toHaveText('Library')
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
  await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await editMode(page)
  await expect(page.locator('.rename-category-tab')).toHaveAttribute('aria-disabled', 'true')

  await tab(page, 'Food').click()

  await expect(activeTab(page)).toHaveText('Food')
  await expect(draftCategory(page)).toHaveText('Food')
  await expect(page.locator('.edit-modal')).toHaveCount(0)
  await page.locator('.rename-category-tab').click()
  await expect(page.locator('.edit-modal')).toHaveAttribute('aria-label', 'Rename category')
})

// The question arrives under a pointer resting where Delete was, so the delete
// that confirms has to be somewhere else — the far end of the row. The dialog
// is shorter without its name field and re-centres, so nothing promises what
// *is* under the pointer; only that it cannot delete.
for (const [what, viewport] of [
  ['on a wide screen', { width: 1280, height: 900 }],
  ['on a phone held upright', { width: 390, height: 844 }],
] as const) {
  test.describe(what, () => {
    test.use({ viewport })
    test('asks to delete a category with nothing that deletes under the pointer', async ({ page }) => {
      const { errors } = await openBoard(page, { phrases: categories(['Food']) })
      // Straight to the toggle: on a phone the microphone's hit area covers the
      // edit toggle's centre, and a click there lands on the microphone.
      await page.locator('.edit-toggle').dispatchEvent('click')
      await tab(page, 'Food').click()
      await page.locator('.rename-category-tab').click()
      const del = page.locator('.edit-action-btn', { hasText: 'Delete' })
      const at = (await del.boundingBox())!
      await del.click()

      await expect(page.locator('.edit-modal[role="alertdialog"]')).toContainText('Delete Food?')
      const confirm = (await del.boundingBox())!
      const x = at.x + at.width / 2
      const y = at.y + at.height / 2
      const covers =
        x >= confirm.x && x <= confirm.x + confirm.width && y >= confirm.y && y <= confirm.y + confirm.height
      expect(covers).toBe(false)
      expect(confirm.x).toBeGreaterThan(at.x + at.width)
      expect(errors).toEqual([])
    })
  })
}

// A category refers to Library's phrases: one phrase ticked into two shows in
// both, and the bin on one takes it out of that one alone.
test('puts a phrase in two categories, and takes it out of one', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await tab(page, 'Food').click()
  await editMode(page)
  await messageBox(page).fill('Tea and toast')
  await page.locator('.category-trigger').click()
  await page
    .locator('.picker-tile')
    .filter({ has: page.locator('.picker-tile-name', { hasText: /^Drinks$/ }) })
    .click()
  await page.locator('.picker-modal-actions .panel-btn[aria-label="Done"]').click()
  await expect(draftCategory(page)).toHaveText('Food, Drinks')
  await page.locator('.icon-btn[aria-label="Save phrase"]').click()

  await expect(cell(page, 'Tea and toast')).toHaveCount(1)
  await tab(page, 'Drinks').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(1)

  await cell(page, 'Tea and toast').click()
  await page.locator('.icon-btn[aria-label="Take out of Drinks"]').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(0)
  await tab(page, 'Food').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(1)
  expect(errors).toEqual([])
})
