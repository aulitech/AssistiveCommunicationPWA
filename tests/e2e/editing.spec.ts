// Writing and rewording phrases in a real browser: where a new phrase goes, and
// whether the board shows it — which is a question about where things are on
// screen, and so one jsdom cannot answer.

import { expect, test } from '@playwright/test'
import {
  activeTab,
  categories,
  cell,
  editMode,
  goTo,
  instantSpeech,
  many,
  marked,
  messageBox,
  openBoard,
  tab,
  within,
} from './board'

const save = (page: import('@playwright/test').Page) => page.locator('.icon-btn[aria-label="Save phrase"]').click()

// Save files it under the tab showing — there is no category to choose — and
// the board, already there, marks it.
test('files a new phrase under the tab showing, and marks it', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await tab(page, 'Food').click()
  await editMode(page)
  await messageBox(page).fill('One for right here')
  await save(page)

  await expect(page.locator('.toast')).toHaveText('Added to Library, Food')
  await expect(activeTab(page)).toHaveText('Food')
  await expect(marked(page)).toHaveText('One for right here')
  expect(errors).toEqual([])
})

/**
 * On a tab behind More, the twentieth of thirty: filed there, marked and
 * scrolled into view, and More still naming the tab.
 */
test('files a new phrase under a tab behind More, and shows it', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: many() })
  await goTo(page, 'Category 20')
  await editMode(page)
  await messageBox(page).fill('One for over there')
  await save(page)

  await expect(activeTab(page)).toHaveText('Category 20')
  await expect(marked(page)).toHaveText('One for over there')
  await expect.poll(() => within(page, '.phrase-cell[aria-current="true"]', '.grid-wrapper')).toBe(true)
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

// **Turning edit mode on opens the phrase and moves nothing**: the tab, the
// cells and where they are scrolled to are as they were. The board as it was
// is the board once the phrase has been said, which it takes its new order
// after.
test('opens the phrase in the message box, and leaves the board as it was', async ({ page }) => {
  await instantSpeech(page)
  const { errors } = await openBoard(page)
  await cell(page, 'Once in a blue moon').first().click()
  await expect(page.locator('.app')).not.toHaveClass(/is-speaking/)
  const before = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('.phrase-cell')].slice(0, 12).map(c => c.textContent),
    top: document.querySelector('.grid-wrapper')!.scrollTop,
  }))
  await editMode(page)

  await expect(activeTab(page)).toHaveText('Library')
  // Open, which the bin says — nothing else in the card does.
  await expect(page.locator('.icon-btn[aria-label="Delete phrase"]')).not.toHaveClass(/is-absent/)
  await expect(messageBox(page)).toHaveValue('Once in a blue moon')
  await expect(marked(page)).toHaveCount(0)
  const after = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('.phrase-cell')].slice(0, 12).map(c => c.textContent),
    top: document.querySelector('.grid-wrapper')!.scrollTop,
  }))
  expect(after).toEqual(before)
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

  await page.locator('.topbar-clear .icon-btn').first().click()

  await expect(cell(page, text)).toHaveCount(1)
  await expect(messageBox(page)).toHaveValue(text)
})

// **The tab showing carries its tools in edit mode**: none on Library; on a
// category, a rest on its name makes it a field where it stands — the tab no
// taller for it — and Enter saves it.
test('moves between categories in edit mode, and renames one on its own tab', async ({ page }) => {
  await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await editMode(page)
  await expect(page.locator('.filter-tab[role="tab"] .tab-tools')).toHaveCount(0)

  await tab(page, 'Food').click()

  await expect(activeTab(page)).toHaveText('Food')
  const before = (await activeTab(page).boundingBox())!
  // The name arrived under the pointer that chose the tab, and answers once it
  // has been aimed at: away, on the page, and back.
  await page.mouse.move(before.x, before.y + 300, { steps: 4 })
  await page.locator('.tab-name').click()
  const field = activeTab(page).locator('input[aria-label="Category name"]')
  await expect(field).toHaveValue('Food')
  await expect(page.locator('.delete-tool')).toBeVisible()
  expect(
    (await activeTab(page).boundingBox())!.height,
    'the tab grew as its name became a field',
  ).toBeLessThanOrEqual(before.height + 1)
  await field.fill('Meals')
  await field.press('Enter')
  await expect(activeTab(page)).toHaveText('Meals')
  await expect(page.locator('.edit-modal')).toHaveCount(0)
})

// **Reorder lifts the tab showing**, blue, and the next tab rested on is where
// it goes.
test('moves a category by its own reorder tool', async ({ page }) => {
  await openBoard(page, { phrases: categories(['Drinks', 'Food', 'Greetings']) })
  await editMode(page)
  await tab(page, 'Greetings').click()
  await page.locator('.reorder-tool').click()

  const held = page.locator('.filter-tab.is-held')
  await expect(held).toHaveText('Greetings')
  const blue = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--held').trim(),
  )
  const probe = await page.evaluate(c => {
    const el = document.createElement('div')
    el.style.color = c
    document.body.append(el)
    const rgb = getComputedStyle(el).color
    el.remove()
    return rgb
  }, blue)
  // Asked until the tab's background has finished fading to it.
  await expect
    .poll(() => held.evaluate(el => getComputedStyle(el).backgroundColor), { message: 'the held tab is not blue' })
    .toBe(probe)

  await tab(page, 'Drinks').click()
  await expect(page.locator('.filter-tab.is-held')).toHaveCount(0)
  const order = await page
    .locator('.filter-tabs > .filter-tab[role="tab"]')
    .evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  expect(order.slice(2)).toEqual(['Greetings', 'Drinks', 'Food'])
})

// The question arrives under a pointer resting where the bin was, on the tab,
// so the delete that confirms has to be somewhere else.
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
      await goTo(page, 'Food')
      // Aimed at, rather than arrived under the pointer: away, and back.
      await page.mouse.move(viewport.width / 2, viewport.height / 2, { steps: 4 })
      await page.locator('.tab-name').click()
      const bin = page.locator('.delete-tool')
      const at = (await bin.boundingBox())!
      await bin.click()

      await expect(page.locator('.edit-modal[role="alertdialog"]')).toContainText('Delete Food?')
      const confirm = (await page.locator('.edit-action-btn', { hasText: 'Delete' }).boundingBox())!
      const x = at.x + at.width / 2
      const y = at.y + at.height / 2
      const covers =
        x >= confirm.x && x <= confirm.x + confirm.width && y >= confirm.y && y <= confirm.y + confirm.height
      expect(covers).toBe(false)
      expect(errors).toEqual([])
    })
  })
}

// A category refers to Library's phrases: the same words saved on a second
// tab put the one phrase in both rather than making a copy, and the bin on one
// takes it out of that one alone.
test('puts a phrase in two categories, and takes it out of one', async ({ page }) => {
  const { errors } = await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await tab(page, 'Food').click()
  await editMode(page)
  await messageBox(page).fill('Tea and toast')
  await save(page)
  await expect(page.locator('.toast')).toHaveText('Added to Library, Food')

  await tab(page, 'Drinks').click()
  await messageBox(page).fill('Tea and toast')
  await expect(page.locator('.toast')).toHaveText('Already on the board — Save adds it to Drinks')
  await save(page)
  await expect(page.locator('.toast')).toHaveText('Already on the board — added to Drinks')
  await expect(cell(page, 'Tea and toast')).toHaveCount(1)

  await cell(page, 'Tea and toast').click()
  await page.locator('.icon-btn[aria-label="Take out of Drinks"]').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(0)
  await tab(page, 'Food').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(1)
  expect(errors).toEqual([])
})
