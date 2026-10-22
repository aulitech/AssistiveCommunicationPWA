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
 * On a tab behind Customize, the twentieth of thirty: filed there, marked and
 * scrolled into view, the tab drawn as itself before Customize.
 */
test('files a new phrase under a tab behind Customize, and shows it', async ({ page }) => {
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
  // Open, which the drag pad on its cell says — nothing in the card does.
  await expect(cell(page, 'Once in a blue moon').first().locator('.reorder-tool')).toBeVisible()
  await expect(messageBox(page)).toHaveValue('Once in a blue moon')
  await expect(marked(page)).toHaveCount(0)
  const after = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('.phrase-cell')].slice(0, 12).map(c => c.textContent),
    top: document.querySelector('.grid-wrapper')!.scrollTop,
  }))
  expect(after).toEqual(before)
  expect(errors).toEqual([])
})

// **The phrase open in the box carries its bin against its left edge and its
// drag pad against its right**, top to bottom, each with 1.5rem of itself
// between its glyph and the words — and the words give up the room, so none of
// them sits under either. Both on the cell's ground, two shades lighter.
test('puts the bin and the drag pad on the open phrase, flush with its edges', async ({ page }) => {
  await openBoard(page)
  await editMode(page)
  const target = page.locator('.phrase-cell').nth(2)
  await target.click()

  await expect(target.locator('.reorder-tool')).toBeVisible()
  // Off the board, so the cell is not magnified while it is measured.
  await page.mouse.move(5, 5, { steps: 4 })
  const m = await target.evaluate(el => {
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const rect = (sel: string) => {
      const b = el.querySelector(sel)!.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const tool = (sel: string) => {
      const t = el.querySelector(sel)!
      const s = getComputedStyle(t)
      return {
        ...rect(sel),
        padLeft: parseFloat(s.paddingLeft),
        padRight: parseFloat(s.paddingRight),
        ground: s.backgroundColor,
      }
    }
    return {
      // Inside the border.
      left: r.left + parseFloat(style.borderLeftWidth),
      right: r.right - parseFloat(style.borderRightWidth),
      top: r.top + parseFloat(style.borderTopWidth),
      bottom: r.bottom - parseFloat(style.borderBottomWidth),
      rem,
      bin: tool('.delete-tool'),
      pad: tool('.reorder-tool'),
      words: rect('.phrase-cell-text'),
    }
  })
  expect(Math.abs(m.bin.left - m.left), 'the bin is not against the left edge').toBeLessThanOrEqual(0.5)
  expect(Math.abs(m.pad.right - m.right), 'the pad is not against the right edge').toBeLessThanOrEqual(0.5)
  for (const t of [m.bin, m.pad]) {
    expect(Math.abs(t.top - m.top), 'not from the top').toBeLessThanOrEqual(0.5)
    expect(Math.abs(t.bottom - m.bottom), 'not to the bottom').toBeLessThanOrEqual(0.5)
    expect(t.ground, 'no ground of its own').not.toBe('rgba(0, 0, 0, 0)')
  }
  expect(m.bin.padRight).toBeCloseTo(1.5 * m.rem, 1)
  expect(m.pad.padLeft).toBeCloseTo(1.5 * m.rem, 1)
  expect(m.words.left, 'the words run under the bin').toBeGreaterThanOrEqual(m.bin.right - 0.5)
  expect(m.words.right, 'the words run under the pad').toBeLessThanOrEqual(m.pad.left + 0.5)
  // Only the open phrase carries them.
  await expect(page.locator('.phrase-cell .tab-tool')).toHaveCount(2)
})

test('puts a deleted phrase back where it was', async ({ page }) => {
  await openBoard(page)
  await editMode(page)
  const target = page.locator('.phrase-cell').nth(2)
  const text = (await target.innerText()).trim()
  await target.click()
  // The bin on its cell asks first.
  await page.locator('.cell-tools .delete-tool').click()
  await page.locator('.edit-action-btn.danger').click()
  await expect(cell(page, text)).toHaveCount(0)

  // Undo, after Paste in the card's top row.
  await page.locator('.tools-history .icon-btn[aria-label^="Undo:"]').click()

  await expect(cell(page, text)).toHaveCount(1)
  await expect(messageBox(page)).toHaveValue(text)

  // Redo takes it again.
  await page.locator('.tools-history .icon-btn[aria-label^="Redo:"]').click()
  await expect(cell(page, text)).toHaveCount(0)
})

// **The bin's question stands over everything** — the emergency bar and the
// message box included — and Enter answers it.
test('covers the whole screen while it asks, and Enter answers it', async ({ page }) => {
  const { errors } = await openBoard(page)
  await editMode(page)
  const target = page.locator('.phrase-cell').nth(2)
  const text = (await target.innerText()).trim()
  await target.click()
  await page.locator('.cell-tools .delete-tool').click()
  await expect(page.locator('[role="alertdialog"]')).toBeVisible()

  const covered = await page.evaluate(() =>
    ['.emergency-btn', '.text-display', '.filter-tab'].map(sel => {
      const r = document.querySelector(sel)!.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return Boolean(top?.closest('.edit-modal-scrim'))
    }),
  )
  expect(covered, 'something behind the question was still under the pointer').toEqual([true, true, true])

  await page.keyboard.press('Enter')
  await expect(page.locator('[role="alertdialog"]')).toHaveCount(0)
  await expect(cell(page, text)).toHaveCount(0)
  expect(errors).toEqual([])
})

// **Each answer fills as it is rested on, and Keep is taken by a rest** —
// the pointer going straight from the bin to it and holding there with a
// gaze's jitter, as it does on the rig. Keep is the nearer answer, so it was
// often reached before the pointer had gone far enough, and then never armed.
test('fills Keep it as it is rested on, and keeps the phrase', async ({ page }) => {
  const { errors } = await openBoard(page)
  await editMode(page)
  const target = page.locator('.phrase-cell').nth(2)
  const text = (await target.innerText()).trim()
  await target.click()
  await page.locator('.cell-tools .delete-tool').click()

  const keep = page.locator('.edit-action-btn', { hasText: 'Keep it' })
  const at = (await keep.boundingBox())!
  const x = at.x + at.width / 2
  const y = at.y + at.height / 2
  await page.mouse.move(x, y, { steps: 8 })
  // Holding as still as a gaze does: a pixel or two either way.
  let filled = 0
  for (let i = 0; i < 30 && (await page.locator('[role="alertdialog"]').count()) > 0; i++) {
    await page.mouse.move(x + (i % 2 ? 2 : -2), y)
    // Asked of the page rather than through the locator, which would wait for
    // a bar that went with the question the moment Keep answered.
    const bar = await page.evaluate(
      () => document.querySelector('.edit-action-btn.cancel .dwell-bar')?.getBoundingClientRect().width ?? 0,
    )
    filled = Math.max(filled, bar)
    await page.waitForTimeout(100)
  }

  await expect(page.locator('[role="alertdialog"]'), 'Keep it never answered a rest').toHaveCount(0)
  expect(filled, 'the fill never showed').toBeGreaterThan(0)
  await expect(cell(page, text)).toHaveCount(1)
  expect(errors).toEqual([])
})

// **The tab showing carries its tools**: on Library only the eye; on a
// category, a rest on its name makes it a field where it stands — the tab no
// taller for it — and Enter saves it.
test('moves between categories in edit mode, and renames one on its own tab', async ({ page }) => {
  await openBoard(page, { phrases: categories(['Food', 'Drinks']) })
  await editMode(page)
  await expect(page.locator('.filter-tab[role="tab"] .tab-name')).toHaveCount(0)
  await expect(page.locator('.filter-tab[role="tab"] .hide-tool')).toHaveCount(1)

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
  await page.locator('.filter-tab .reorder-tool').click()

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
      await page.locator('.autospeak-toggle').dispatchEvent('click')
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

  // Saved, the box is empty, so the phrase chosen opens.
  await cell(page, 'Tea and toast').click()
  await page.locator('.cell-tools .delete-tool').click()
  await expect(page.locator('.edit-modal[role="alertdialog"]')).toContainText('Take it out of Drinks?')
  await page.locator('.edit-action-btn.danger').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(0)
  await tab(page, 'Food').click()
  await expect(cell(page, 'Tea and toast')).toHaveCount(1)
  expect(errors).toEqual([])
})

// **Found by typing in edit mode, a phrase on the tab showing opens and its
// cell comes into view** — here two hundred cells down Library. Every cell the
// scroll passes takes its real height as it comes near the screen
// (`content-visibility: auto`), so the cell moved after it was aimed at and
// the scroll went a screen and a half past it: the grid aims again once the
// scroll comes to rest. jsdom has no layout, so only a browser can see it.
test('opens a phrase found by typing and brings its cell into view, however far down', async ({ page }) => {
  const { errors } = await openBoard(page)
  await editMode(page)
  const box = page.locator('.text-display')
  await box.click()
  await page.keyboard.type('ttyl')
  const found = page.locator('.phrase-cell').first()
  const text = (await found.textContent())!
  await found.click()

  const cell = page.locator('.phrase-cell[aria-current="true"]')
  await expect(cell).toHaveText(text)
  await expect(box).toHaveValue(text)
  await expect(cell.locator('.cell-tools'), 'opened, with its tools').toHaveCount(1)
  const index = await page.evaluate(
    t => [...document.querySelectorAll('.phrase-cell')].findIndex(c => c.textContent === t),
    text,
  )
  expect(index, 'not far enough down to need the scroll').toBeGreaterThan(100)
  // Where it comes to rest, not somewhere it passes on the way: the scroll
  // went through it, and a check made then saw it on screen.
  await page.waitForFunction(
    () =>
      new Promise(done => {
        const grid = document.querySelector('.grid-wrapper')!
        let last = -1
        let still = 0
        const watch = () => {
          still = grid.scrollTop === last ? still + 1 : 0
          last = grid.scrollTop
          if (still > 20) done(true)
          else requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)
      }),
  )
  await expect(cell).toBeInViewport({ ratio: 1, timeout: 1 })
  expect(errors).toEqual([])
})
