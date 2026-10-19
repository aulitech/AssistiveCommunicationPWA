// Where things are, which is the one question jsdom cannot be asked. Each of
// these was written in AGENTS.md as "a question for the deploy preview".

import { expect, test } from '@playwright/test'
import { categories, many, messageBox, openBoard } from './board'

test.describe('on a phone held upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // The bar does not scroll: one row of tabs, and More for what will not fit.
  // A category of its own and the two pinned tabs fit on one row: no More,
  // and every tab on screen.
  test('puts every tab on one row where they fit, with no More', async ({ page }) => {
    await openBoard(page, { phrases: categories(['Nurse']) })
    const tabs = page.locator('.filter-tab[role="tab"]')
    await expect(tabs).toHaveCount(3)
    for (const t of await tabs.all()) await expect(t).toBeInViewport({ ratio: 1 })
    await expect(page.locator('.filter-more[role="tab"]')).toHaveCount(0)
  })

  // Thirty categories were a screen of tabs and no board. One row, and the
  // rest behind More, which goes to one of them and then carries its name.
  test('holds the tabs to one row, and the rest behind More', async ({ page }) => {
    await openBoard(page, { phrases: many() })
    // A row is tabs within a few pixels of each other: the tab showing stands
    // a pixel lower, over the bar's edge. Rounding them to the nearest ten put
    // that pixel either side of a boundary as the bar above moved.
    const rows = await page.locator('.filter-tabs > .filter-tab').evaluateAll(els => {
      const tops = els.map(e => e.getBoundingClientRect().top).sort((a, b) => a - b)
      return tops.filter((top, i) => i === 0 || top - tops[i - 1]! > 4).length
    })
    expect(rows).toBe(1)
    const more = page.locator('.filter-more[role="tab"]')
    await expect(more).toHaveText('More')
    await expect(page.locator('.phrase-cell').first()).toBeInViewport()

    await more.click()
    await page
      .locator('.picker-tile')
      .filter({ hasText: /^Category 25$/ })
      .click()
    await page.locator('.picker-modal-actions .panel-btn[aria-label="Done"]').click()
    await expect(more).toHaveText('Category 25')
    await expect(more).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.phrase-cell').first()).toHaveText('First in Category 25')
  })

  test('never scrolls sideways', async ({ page }) => {
    await openBoard(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.emergency-bar')).toBeInViewport()
  })

  // The toast is ringed by a wide border. Placed at the middle, it used to
  // shrink to the half of the screen right of that, which on a phone left the
  // words five lines of two.
  test('gives the toast the width of the table, less a gutter', async ({ page }) => {
    await openBoard(page)
    // The microphone's area answers over the edit toggle at this width, so the
    // click goes to the toggle itself.
    await page.locator('.edit-toggle').dispatchEvent('click')
    const toast = page.locator('.toast')
    await expect(toast).toBeVisible()
    const { left, right, table, border, lines } = await toast.evaluate(el => {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        left: r.left,
        right: r.right,
        table: document.querySelector('.grid-wrapper')!.getBoundingClientRect().right,
        border: parseFloat(style.borderTopWidth),
        lines: Math.round(
          (r.height - 2 * parseFloat(style.borderTopWidth)) / parseFloat(style.lineHeight || '24'),
        ),
      }
    })
    // 1.3rem, which Chrome draws on a whole pixel.
    expect(Math.abs(border - 1.3 * 16)).toBeLessThan(1)
    expect(left).toBeGreaterThanOrEqual(15)
    expect(right).toBeLessThanOrEqual(table - 15)
    expect(right - left).toBeGreaterThan(280)
    expect(lines).toBeLessThanOrEqual(3)
  })

  // Getting started stands where the box, the tabs and the grid are: down to
  // the emergency bar and no further, and no wider than the phone.
  test('opens Getting started on signing in, above the emergency bar', async ({ page }) => {
    await page.goto('/')
    await page.locator('.auth-btn[aria-label="Continue as guest"]').click()
    await expect(page.locator('.introduction')).toBeVisible()

    const { introduction, bar, overflow } = await page.evaluate(() => ({
      introduction: document.querySelector('.introduction')!.getBoundingClientRect().bottom,
      bar: document.querySelector('.emergency-bar')!.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }))
    expect(Math.abs(introduction - bar)).toBeLessThan(1)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.emergency-bar')).toBeInViewport()
    await expect(page.locator('.introduction .panel-btn[aria-label="Start"]')).toBeInViewport()
  })
})

// Wide enough for both, Getting started takes the left half and the board works
// in the right, down to the emergency bar.
test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test('puts Getting started beside the board, half each', async ({ page }) => {
    await page.goto('/')
    await page.locator('.auth-btn[aria-label="Continue as guest"]').click()
    await expect(page.locator('.introduction')).toBeVisible()
    await expect(page.locator('.text-display')).toBeVisible()

    const { introduction, board, bar, overflow } = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      return {
        introduction: box('.introduction'),
        board: box('.board-column'),
        bar: box('.emergency-bar'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(introduction.left).toBe(0)
    expect(Math.abs(introduction.width - 700)).toBeLessThan(1)
    expect(Math.abs(board.left - introduction.right)).toBeLessThan(1)
    expect(Math.abs(board.right - 1400)).toBeLessThan(1)
    for (const half of [introduction, board]) expect(Math.abs(half.bottom - bar.top)).toBeLessThan(1)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('.phrase-cell').first()).toBeInViewport()
  })
})

// Where a gaze working the board already is, rather than a corner.
test('puts the toast in the upper third of the phrase table, across its middle', async ({ page }) => {
  await openBoard(page)
  await page.locator('.edit-toggle').dispatchEvent('click')
  await expect(page.locator('.toast')).toBeVisible()
  const { toast, table } = await page.evaluate(() => ({
    toast: document.querySelector('.toast')!.getBoundingClientRect().toJSON(),
    table: document.querySelector('.grid-wrapper')!.getBoundingClientRect().toJSON(),
  }))
  const middle = { x: toast.left + toast.width / 2, y: toast.top + toast.height / 2 }
  // Its middle on the middle of the table's upper third.
  expect(Math.abs(middle.y - (table.top + table.height / 6))).toBeLessThan(1)
  expect(Math.abs(middle.x - (table.left + table.width / 2))).toBeLessThan(1)
})

// **Edit mode is said on the panel's edge**, in a muted green, and not on the
// phrases, which keep their size. And the toast over them is at 85%, ringed in
// a muted accent rather than the full one.
test("greens the panel's edge in edit mode, not the phrases, under a toast at 85%", async ({ page }) => {
  await openBoard(page)
  const cell = page.locator('.phrase-cell').first()
  const before = await cell.evaluate(el => el.getBoundingClientRect().toJSON())
  const edge = () => page.locator('.grid-area').evaluate(el => getComputedStyle(el).borderTopColor)
  const grey = await edge()
  await page.locator('.edit-toggle').dispatchEvent('click')
  await expect(page.locator('.toast')).toBeVisible()
  const { outline, after, toast } = await cell.evaluate(el => {
    const style = getComputedStyle(el)
    const t = getComputedStyle(document.querySelector('.toast')!)
    return {
      outline: style.outlineStyle,
      after: el.getBoundingClientRect().toJSON(),
      toast: { opacity: t.opacity, ring: t.borderTopColor },
    }
  })
  expect(outline, 'an outline on the phrases').toBe('none')
  expect(await edge(), "the panel's edge did not change").not.toBe(grey)
  expect(after.width).toBeCloseTo(before.width, 1)
  expect(after.height).toBeCloseTo(before.height, 1)
  expect(toast.opacity).toBe('0.85')
  // Muted: no channel of the ring as far from the others as the accent's green.
  // A colour mixed in sRGB is reported as `color(srgb …)`, each channel 0 to 1.
  const scale = toast.ring.startsWith('color(') ? 255 : 1
  const [r, g, b] = (toast.ring.match(/[\d.]+/g) ?? []).map(v => Number(v) * scale)
  expect(g - Math.min(r, b)).toBeLessThan(120)
  expect(g).toBeGreaterThan(Math.max(r, b))
})

test.describe('on a short screen', () => {
  test.use({ viewport: { width: 1024, height: 640 } })

  // A nudge repeats while it is held and the ends reach either end in one
  // dwell, so the page controls are room a short screen has better use for.
  test('drops the grid rail’s page controls', async ({ page }) => {
    await openBoard(page)
    await expect(page.locator('.scroll-btn-page').first()).toBeHidden()
  })
})

// It grows from one line to its cap as what is in it grows — measured, since
// a line is however many characters fit at this size and width.
test('grows the message box with what is in it', async ({ page }) => {
  await openBoard(page)
  const before = await messageBox(page).evaluate(el => el.getBoundingClientRect().height)
  await messageBox(page).fill('A message long enough to need more than the one line the box starts at. '.repeat(3))
  const after = await messageBox(page).evaluate(el => el.getBoundingClientRect().height)
  expect(after).toBeGreaterThan(before)
})

/**
 * **The message box is a card with its controls inside it** — on its line and
 * in the row under it, the modes on the card's centre — and on a phone, where
 * the row stacks, still none of them close enough to another to share a rest. Each carries an invisible area 6px past its edges, so two closer than
 * 12px overlap there, and a gaze resting between them answers to whichever the
 * browser picks. In both modes, since edit mode's row is the wider.
 */
for (const [width, height] of [
  [360, 740],
  [390, 844],
  [1280, 900],
]) {
  test(`keeps every control inside the card, none sharing a rest, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openBoard(page)
    for (const mode of ['speaking', 'editing']) {
      if (mode === 'editing') await page.locator('.edit-toggle').dispatchEvent('click')
      // Words in the box, so Speak — or Save and Speak — is drawn at the end of the line.
      await page.locator('.text-display').fill('Could you open the window a little, please?')
      const { outside, crowded, offCentre } = await page.evaluate(() => {
        const card = document.querySelector('.message-wrap')!.getBoundingClientRect()
        const modes = document.querySelector('.tools-modes')!.getBoundingClientRect()
        const offCentre = Math.abs((modes.left + modes.right) / 2 - (card.left + card.right) / 2)
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            '.message-line [role="button"], .message-line button, .message-tools [role="button"], .message-tools button',
          ),
        ]
          // Not Rest, which is the open space behind the row's controls, and
          // so lies round every one of them.
          .filter(el => el.offsetParent && !el.classList.contains('rest-surface'))
          .map(el => ({ name: el.getAttribute('aria-label') ?? '', r: el.getBoundingClientRect() }))
        const outside = controls
          .filter(
            ({ r }) => r.left < card.left || r.right > card.right || r.top < card.top || r.bottom > card.bottom,
          )
          .map(c => c.name)
        const crowded: string[] = []
        for (const [i, a] of controls.entries())
          for (const b of controls.slice(i + 1)) {
            const dx = Math.max(b.r.left - a.r.right, a.r.left - b.r.right)
            const dy = Math.max(b.r.top - a.r.bottom, a.r.top - b.r.bottom)
            if (Math.max(dx, dy) < 11.5) crowded.push(`${a.name} / ${b.name}`)
          }
        return { outside, crowded, offCentre }
      })
      expect(outside, `${mode}: outside the card`).toEqual([])
      expect(crowded, `${mode}: close enough to share a rest`).toEqual([])
      expect(offCentre, `${mode}: the modes are not on the card's centre`).toBeLessThan(2)
    }
  })
}

/**
 * **Speak stands right after the last word typed** — measured against the words
 * themselves, set in the box's own type on a canvas, so the test does not ask
 * the copy `AfterText` places it by and then believe it.
 */
test('puts Speak right after the last word, on its line', async ({ page }) => {
  await openBoard(page)
  await page.locator('.text-display').fill('Hello there')
  const { speak, expected, line } = await page.evaluate(() => {
    const box = document.querySelector<HTMLTextAreaElement>('.text-display')!
    const style = getComputedStyle(box)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const r = box.getBoundingClientRect()
    const s = document.querySelector('.icon-btn[aria-label="Speak"]')!.getBoundingClientRect()
    return {
      speak: { left: s.left, middle: (s.top + s.bottom) / 2 },
      expected: r.left + parseFloat(style.paddingLeft) + ctx.measureText('Hello there').width,
      line: r.top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2,
    }
  })
  // A rem and a few pixels after the word, and no more.
  expect(speak.left - expected).toBeGreaterThan(18)
  expect(speak.left - expected).toBeLessThan(28)
  expect(Math.abs(speak.middle - line), 'not on the line the words are on').toBeLessThan(3)

  // More words, and it moves with them.
  await page.locator('.text-display').fill('Hello there, how are you')
  const moved = await page.locator('.icon-btn[aria-label="Speak"]').evaluate(el => el.getBoundingClientRect().left)
  expect(moved).toBeGreaterThan(speak.left + 40)
})

// The last line full, so Speak goes to the start of the next — and the box grows
// to hold that line, rather than Speak being drawn under its edge.
test('wraps Speak onto a line of its own when the last has no room, inside the box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openBoard(page)
  const box = page.locator('.text-display')
  await box.fill('x')
  const oneLine = await box.evaluate(el => el.getBoundingClientRect().height)
  // Grow the words a letter at a time until Speak is pushed to a line of its own.
  let text = 'Could you open the window'
  for (let i = 0; i < 40; i++) {
    await box.fill(text)
    const wrapped = await page.evaluate(() => {
      const b = document.querySelector('.text-display')!.getBoundingClientRect()
      const s = document.querySelector('.icon-btn[aria-label="Speak"]')!.getBoundingClientRect()
      return s.left - b.left < 40 && s.top - b.top > 30
    })
    if (wrapped) break
    text += 'a'
  }
  const { speak, field } = await page.evaluate(() => ({
    speak: document.querySelector('.icon-btn[aria-label="Speak"]')!.getBoundingClientRect().toJSON(),
    field: document.querySelector('.text-display')!.getBoundingClientRect().toJSON(),
  }))
  expect(speak.left - field.left, 'it never wrapped').toBeLessThan(40)
  // On a line of its own it starts where the words do, with no gap before it.
  const padLeft = await box.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))
  expect(Math.abs(speak.left - field.left - padLeft), 'indented on a line of its own').toBeLessThan(2)
  expect(speak.bottom, 'drawn under the box’s edge').toBeLessThanOrEqual(field.bottom)
  expect(field.height).toBeGreaterThan(oneLine)
})

/**
 * **It moves with the words, so it must not fire under a pointer it arrived
 * under.** Typing is already covered — the grid narrows to what is typed, and
 * that holds every dwell until the pointer moves. What is left is Speak moving
 * on its own: the screen narrowing rewraps the words, and Speak lands somewhere
 * new. The pointer is rested there first, drifting as a gaze does, and nothing
 * is said — until it moves away and back.
 */
test('does not speak when Speak arrives under a resting pointer', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { said: number }
    w.said = 0
    speechSynthesis.speak = () => void w.said++
    // **A two-second action dwell**, still under the three seconds each wait
    // below gives Speak. Before the screen narrows, the pointer rests on
    // whatever the wide screen has there — open space that rests the app, once
    // — and on a slow machine that passed the usual 0.8s.
    if (!localStorage.getItem('dwellspeak_settings')) {
      localStorage.setItem('dwellspeak_settings', JSON.stringify({ selectionPauseMs: 0, actionDwellMs: 2000 }))
    }
  })
  const said = () => page.evaluate(() => (window as unknown as { said: number }).said)
  const speakAt = () =>
    page.locator('.icon-btn[aria-label="Speak"]').evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
  await page.setViewportSize({ width: 820, height: 900 })
  await openBoard(page)
  await page.locator('.edit-toggle').dispatchEvent('click')
  await page.locator('.edit-toggle').dispatchEvent('click')
  await page
    .locator('.text-display')
    .fill('Could you open the window a little, please, and leave it open until the evening')
  const narrow = await speakAt()

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForTimeout(300)
  const wide = await speakAt()
  expect(Math.abs(wide.x - narrow.x) + Math.abs(wide.y - narrow.y), 'Speak did not move').toBeGreaterThan(40)
  // Not long enough for whatever the wide screen has here to answer — see the
  // dwell set above.
  await page.mouse.move(narrow.x, narrow.y)
  await page.waitForTimeout(300)

  // The screen narrows, the words rewrap, and Speak lands under the pointer.
  await page.setViewportSize({ width: 820, height: 900 })
  await page.waitForTimeout(300)
  expect(await speakAt(), 'Speak did not come back to the same place').toEqual(narrow)
  // A gaze is never quite still: it drifts a pixel or two, which is what tells
  // the browser the pointer is over whatever has just arrived under it.
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(narrow.x + (i % 2), narrow.y + ((i + 1) % 2))
    await page.waitForTimeout(100)
  }
  expect(await said(), 'spoken by nobody').toBe(0)
  await expect(page.locator('.app'), 'rested on the way').not.toHaveClass(/resting/)

  await page.mouse.move(narrow.x + 200, narrow.y + 200, { steps: 5 })
  await page.mouse.move(narrow.x, narrow.y, { steps: 5 })
  await page.waitForTimeout(3000)
  expect(await said()).toBe(1)
})

// The box is sized by the copy Speak is placed with as well as by its words, and
// on a resize that copy is measured at the new width — or a box that rewrapped
// onto fewer lines kept the height of the old ones.
test('gives the box its new height when the screen widens and the words rewrap', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await openBoard(page)
  const box = page.locator('.text-display')
  const height = () => box.evaluate(el => Math.round(el.getBoundingClientRect().height))
  await box.fill('x')
  const oneLine = await height()

  await page.setViewportSize({ width: 820, height: 900 })
  await box.fill('Could you open the window a little, please, and leave it open until the evening')
  expect(await height(), 'it did not wrap at the narrow width').toBeGreaterThan(oneLine)

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForTimeout(300)
  expect(await height()).toBe(oneLine)
})

/**
 * **The menu is in the message card, at the upper right**: last in the card's
 * row of controls, at its right end, and well clear of the voice before it.
 * The busy indicator stands clear of the top row altogether — over the lower
 * right of the phrase table — rather than over any control in it.
 */
for (const width of [360, 1280]) {
  test(`puts the menu at the card's upper right, clear of the voice and the busy indicator, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await openBoard(page)
    const { menu, card, before, busy, topbar } = await page.evaluate(() => {
      const region = document.createElement('div')
      region.className = 'busy-region'
      region.style.width = '8rem'
      region.style.height = '2rem'
      document.body.append(region)
      const busy = region.getBoundingClientRect().toJSON()
      region.remove()
      const menu = document.querySelector('[aria-label="Open menu"]')!
      return {
        menu: menu.getBoundingClientRect().toJSON(),
        before: menu.previousElementSibling?.getBoundingClientRect().toJSON(),
        card: document.querySelector('.message-wrap')!.getBoundingClientRect().toJSON(),
        busy,
        topbar: document.querySelector('.topbar')!.getBoundingClientRect().toJSON(),
      }
    })
    expect(card.right - menu.right, 'not at the right end of the card').toBeLessThan(20)
    expect(menu.left, 'not inside the card').toBeGreaterThanOrEqual(card.left)
    expect(menu.top - card.top, "not in the card's upper row").toBeLessThan(40)
    if (before) expect(menu.left - before.right, 'not well clear of the voice').toBeGreaterThanOrEqual(36)
    expect(busy.top, 'the busy indicator stands over the top row').toBeGreaterThanOrEqual(topbar.bottom)
  })
}

/**
 * Regression guard. **Edit mode narrowed the box under words that do not
 * change** — what was being edited took the line's right end — and they rewrapped
 * into more lines. The box kept the height it had, and Save, kept inside it,
 * was drawn on the wrong line. Asked of where Save stands against where it
 * stands once the box is made to measure itself again, going in and coming out.
 */
test('puts Save after the last word when edit mode rewraps the words', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 })
  await openBoard(page)
  const box = page.locator('.text-display')
  await box.pressSequentially(
    'This is a rather long message that will run past the end of one line in the box, and more',
  )
  const at = () =>
    page.evaluate(() => ({
      after: document.querySelector('.after-text')!.getBoundingClientRect().toJSON(),
      box: document.querySelector('.text-display')!.getBoundingClientRect().toJSON(),
    }))
  const remeasured = async () => {
    await box.press('End')
    await page.keyboard.type('x')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    return at()
  }
  for (const label of ['into edit mode', 'out of edit mode']) {
    await page.locator('.edit-toggle').click()
    await page.mouse.move(5, 790)
    await page.waitForTimeout(400)
    const now = await at()
    expect(now, `${label}: drawn somewhere else until the box measured itself again`).toEqual(await remeasured())
    expect(now.after.bottom, `${label}: drawn under the box's edge`).toBeLessThanOrEqual(now.box.bottom)
  }
})

/**
 * Regression guard. **The copy that finds where the words end is exactly as
 * wide as the box**, to the fraction of a pixel. It was given `offsetWidth`,
 * which rounds, and a box flex shares a line out to is fractional — 387.11px —
 * so wherever a line's last word fitted only in that fraction, the copy broke
 * the line a word early and Save or Speak stood after the wrong word. A mode
 * switch changes what the box shares its line with, which is where it showed.
 * At twice the pixel density, as on a Mac's own screen.
 */
test.describe('on a high-density screen', () => {
  test.use({ deviceScaleFactor: 2 })
  test('lays the copy out at the box’s own width, in every mode', async ({ page }) => {
    await page.setViewportSize({ width: 777, height: 800 })
    await openBoard(page)
    await page
      .locator('.text-display')
      .fill('This is a rather long message that will run past the end of one line')
    const widths = () =>
      page.evaluate(() => {
        const box = document.querySelector('.text-display')!.getBoundingClientRect().width
        const copy = document.querySelector('.message-field > .after-text-mirror')!.getBoundingClientRect().width
        return { box, copy }
      })
    for (const label of ['building', 'editing', 'building again']) {
      if (label !== 'building') {
        await page.locator('.edit-toggle').click()
        await page.mouse.move(5, 790)
        await page.waitForTimeout(400)
      }
      const { box, copy } = await widths()
      expect(Number.isInteger(box), `${label}: the box is not fractional here, so this proves nothing`).toBe(false)
      expect(Math.abs(copy - box), `${label}: the copy is not the box's width`).toBeLessThan(0.01)
    }
  })
})

/**
 * **The slot that empties the box is centred on the words**, however many lines
 * they run to, in both modes and on a phone — Clear, Undo, or in edit mode the
 * start of a new phrase. The box pads its words equally above and below, so its
 * centre is theirs.
 */
for (const width of [1280, 390]) {
  test(`centres Clear on the words, one line or several, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openBoard(page)
    const box = page.locator('.text-display')
    const offCentre = () =>
      page.evaluate(() => {
        const slot = document.querySelector('.message-line > .topbar-clear .icon-btn')!.getBoundingClientRect()
        const b = document.querySelector('.text-display')!.getBoundingClientRect()
        return Math.abs((slot.top + slot.bottom) / 2 - (b.top + b.bottom) / 2)
      })
    for (const mode of ['building', 'editing']) {
      if (mode === 'editing') {
        await page.locator('.edit-toggle').click()
        await page.mouse.move(5, 890)
      }
      for (const words of [
        'Hello',
        'This message runs on well past the end of a single line of the box, and then on again',
      ]) {
        await box.fill(words)
        await page.waitForTimeout(150)
        expect(await offCentre(), `${mode}, ${words.length} letters: not on the words' centre`).toBeLessThan(1.5)
      }
    }
  })
}

// **The cell under the pointer, magnified**, as the Dock does — over the cells
// around it, and moving none of them.
test.describe('the magnified cell', () => {
  const rects = (page: import('@playwright/test').Page) =>
    page.locator('.phrase-cell').evaluateAll(els =>
      els.slice(0, 15).map(e => {
        const r = e.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
      }),
    )

  test('grows over its neighbours and moves none of them', async ({ page }) => {
    await openBoard(page)
    const before = await rects(page)
    const cell = page.locator('.phrase-cell').nth(6)
    await cell.hover()
    await expect(page.locator('.phrase-place.is-magnified')).toHaveCount(1)
    const after = await rects(page)
    const grown = after[6]!
    expect(grown[2], 'not wider').toBeGreaterThan(before[6]![2])
    expect(grown[3], 'not taller').toBeGreaterThan(before[6]![3])
    after.splice(6, 1)
    before.splice(6, 1)
    expect(after, 'a neighbour moved').toEqual(before)
  })

  test('stays inside the grid at its edge', async ({ page }) => {
    await openBoard(page)
    await page.locator('.phrase-cell').first().hover()
    await expect(page.locator('.phrase-place.is-magnified')).toHaveCount(1)
    await page.waitForTimeout(200)
    const { cell, grid } = await page.evaluate(() => {
      const c = document.querySelector('.is-magnified > .phrase-cell')!.getBoundingClientRect()
      const g = document.querySelector('.grid-wrapper')!.getBoundingClientRect()
      return { cell: [c.left, c.top, c.right, c.bottom], grid: [g.left, g.top, g.right, g.bottom] }
    })
    expect(cell[0]).toBeGreaterThanOrEqual(grid[0])
    expect(cell[1]).toBeGreaterThanOrEqual(grid[1])
    expect(cell[2]).toBeLessThanOrEqual(grid[2])
  })

  // One line of 15rem in a cell, cut off past it; magnified, the whole of it
  // in lines of up to 30rem.
  test('cuts a long phrase off in its cell, and shows it whole magnified', async ({ page }) => {
    await openBoard(page, {
      phrases: [
        {
          id: 'custom-long',
          text: 'Could you please let the nurse know that I would like to sit up in the chair for a while this afternoon',
          category: 'Long',
        },
      ],
    })
    await page.locator('.filter-tab[role="tab"]', { hasText: 'Long' }).click()
    const words = page.locator('.phrase-cell-text').first()
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
    const cut = (await words.boundingBox())!
    expect(cut.width).toBeLessThanOrEqual(15 * rem + 1)
    expect(await words.evaluate(e => e.scrollWidth > e.clientWidth), 'not cut off').toBe(true)
    expect(cut.height, 'more than one line').toBeLessThan(2 * rem)
    await page.locator('.phrase-cell').first().hover()
    await expect(page.locator('.phrase-place.is-magnified')).toHaveCount(1)
    await page.waitForTimeout(200)
    const wide = (await words.boundingBox())!.width
    expect(wide).toBeGreaterThan(15 * rem)
    expect(wide).toBeLessThanOrEqual(30 * rem + 1)
    expect(await words.evaluate(e => e.scrollWidth > e.clientWidth), 'still cut off').toBe(false)
  })

  // Grown under the pointer, it is still the cell the pointer travelled to —
  // not one that came to it — and a rest says it.
  test('still answers a rest', async ({ page }) => {
    await openBoard(page)
    const cell = page.locator('.phrase-cell').nth(6)
    const text = await cell.textContent()
    const box = (await cell.boundingBox())!
    await page.mouse.move(box.x - 40, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
    await expect(messageBox(page)).toHaveValue(text!, { timeout: 5000 })
  })
})

// **Rest is the open space in the message card's row of controls.** Wherever
// nothing in that row answers — the gaps between its groups — the pointer
// reaches the surface behind, and a click there rests the app; the controls
// answer as themselves, and the rest of the top row does nothing.
test('rests on a click in the open space of the card’s row of controls, and nowhere else', async ({ page }) => {
  await openBoard(page)
  const app = page.locator('.app')
  const hits = await page.evaluate(() => {
    const at = (x: number, y: number) => document.elementFromPoint(x, y)?.classList.contains('rest-surface')
    const card = document.querySelector('.message-wrap')!.getBoundingClientRect()
    const tools = document.querySelector('.message-tools')!.getBoundingClientRect()
    const clipboard = document.querySelector('.tools-clipboard')!.getBoundingClientRect()
    const modes = document.querySelector('.tools-modes')!.getBoundingClientRect()
    const centre = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2] as const
    }
    return {
      gap: at((clipboard.right + modes.left) / 2, tools.top + tools.height / 2),
      above: at(card.left + 60, card.top - 4),
      edit: at(...centre('.edit-toggle')),
      box: at(...centre('.text-display')),
      menu: at(...centre('.menu-btn')),
    }
  })
  expect(hits).toEqual({ gap: true, above: false, edit: false, box: false, menu: false })

  const gap = await page.evaluate(() => {
    const tools = document.querySelector('.message-tools')!.getBoundingClientRect()
    const clipboard = document.querySelector('.tools-clipboard')!.getBoundingClientRect()
    const modes = document.querySelector('.tools-modes')!.getBoundingClientRect()
    return { x: (clipboard.right + modes.left) / 2, y: tools.top + tools.height / 2 }
  })
  await page.mouse.click(gap.x, gap.y)
  await expect(app).toHaveClass(/resting/)
  await expect(page.locator('.paused-note')).toHaveText('Paused')
  // Resume came up under the pointer; it answers once the pointer has left the row.
  await page.locator('.resume-bar').dispatchEvent('click')
  await expect(app, 'resumed without the pointer leaving the row').toHaveClass(/resting/)
  await page.mouse.move(gap.x, gap.y + 300)
  await page.mouse.click(gap.x, gap.y)
  await expect(app).not.toHaveClass(/resting/)
})

// **Every prompt in the two boxes is one line on any screen** — measured in
// the box's own font against the room inside it, on the narrowest phone. The
// question box's two are measured both, since which shows depends on whether
// the microphone is listening, and here it never starts.
test('fits every prompt in the boxes on one line at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await openBoard(page)
  const fits = (sel: string, prompt?: string) =>
    page.locator(sel).evaluate((el, prompt) => {
      const field = el as HTMLTextAreaElement
      const s = getComputedStyle(field)
      const room = field.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      const pen = document.createElement('canvas').getContext('2d')!
      pen.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      const text = prompt ?? field.placeholder
      return { prompt: text, width: pen.measureText(text).width, room }
    }, prompt)
  const prompts = [await fits('.text-display')]
  await page.locator('.edit-toggle').dispatchEvent('click')
  prompts.push(await fits('.text-display'))
  await page.locator('.edit-toggle').dispatchEvent('click')
  await page.locator('.listen-toggle').dispatchEvent('click')
  prompts.push(await fits('.heard-text', 'Say or type a question'), await fits('.heard-text', 'Nothing heard yet'))
  for (const { prompt, width, room } of prompts)
    expect(width, `"${prompt}" is more than a line`).toBeLessThanOrEqual(room)
  expect(prompts.slice(0, 2).map(p => p.prompt)).toEqual(['Choose a phrase', 'Write or choose one'])
})

// **The question's line is inside the message box**, left of the message's on
// a wide screen and above it on a narrow one.
for (const [width, beside] of [
  [1280, true],
  [390, false],
] as const) {
  test(`puts the question's line inside the message box, ${beside ? 'left of' : 'above'} the message's, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await openBoard(page)
    await page.locator('.listen-toggle').dispatchEvent('click')
    const { card, question, message } = await page.evaluate(() => ({
      card: document.querySelector('.message-wrap')!.getBoundingClientRect().toJSON(),
      question: document.querySelector('.message-wrap .heard-wrap')!.getBoundingClientRect().toJSON(),
      message: document.querySelector('.message-wrap .message-line')!.getBoundingClientRect().toJSON(),
    }))
    for (const box of [question, message]) {
      expect(box.left, 'outside the card').toBeGreaterThanOrEqual(card.left - 1)
      expect(box.right, 'outside the card').toBeLessThanOrEqual(card.right + 1)
    }
    if (beside) {
      expect(question.right, 'not left of the message').toBeLessThanOrEqual(message.left)
      expect(Math.abs(question.top - message.top), 'not on the same line').toBeLessThan(2)
    } else {
      expect(question.bottom, 'not above the message').toBeLessThanOrEqual(message.top)
    }
  })
}

// **Emergency words the bar cuts off are shown whole in the middle of the
// phrase table** while their button is rested on: on a phone held upright the
// bar cuts them, and on a wide screen it does not and nothing is shown.
for (const [width, cut] of [
  [390, true],
  [1280, false],
] as const) {
  test(`shows a rested-on emergency phrase whole in the table ${cut ? 'where the bar cuts it off' : 'only where the bar cuts it off'}, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await openBoard(page)
    const button = page.locator('.emergency-btn:not(.emergency-tool)').first()
    const words = (await button.getAttribute('aria-label'))!
    await button.hover()
    const peek = page.locator('.emergency-peek')
    if (!cut) {
      await expect(peek).toHaveCount(0)
      return
    }
    await expect(peek).toHaveText(words)
    const { table, card } = await page.evaluate(() => ({
      table: document.querySelector('.grid-area')!.getBoundingClientRect().toJSON(),
      card: document.querySelector('.emergency-peek span')!.getBoundingClientRect().toJSON(),
    }))
    const middle = (r: { left: number; right: number; top: number; bottom: number }) => [
      (r.left + r.right) / 2,
      (r.top + r.bottom) / 2,
    ]
    const [tx, ty] = middle(table)
    const [cx, cy] = middle(card)
    expect(Math.abs(cx - tx), 'not centred across the table').toBeLessThan(2)
    expect(Math.abs(cy - ty), 'not centred down the table').toBeLessThan(2)
    await page.mouse.move(width / 2, 100)
    await expect(peek).toHaveCount(0)
  })
}
