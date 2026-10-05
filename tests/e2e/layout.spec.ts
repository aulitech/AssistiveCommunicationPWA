// Where things are, which is the one question jsdom cannot be asked. Each of
// these was written in AGENTS.md as "a question for the deploy preview".

import { expect, test } from '@playwright/test'
import { messageBox, openBoard } from './board'

test.describe('on a phone held upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // Six arrows and the tools leave a portrait phone almost no room for the
  // tabs; paging reaches either end too.
  test('drops the arrows that go all the way to either end of the tabs', async ({ page }) => {
    await openBoard(page)
    await expect(page.locator('.filter-arrow-end').first()).toBeHidden()
    await expect(page.locator('.filter-arrow:not(.filter-arrow-end)').first()).toBeVisible()
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
    for (const mode of ['composing', 'editing']) {
      if (mode === 'editing') await page.locator('.edit-toggle').dispatchEvent('click')
      // Words in the box, so Speak — or Save — is drawn at the end of the line.
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
          .filter(el => el.offsetParent)
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
  })
  const said = () => page.evaluate(() => (window as unknown as { said: number }).said)
  const speakAt = () =>
    page.locator('.icon-btn[aria-label="Speak"]').evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
  await page.setViewportSize({ width: 900, height: 900 })
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
  await page.mouse.move(narrow.x, narrow.y)
  await page.waitForTimeout(1500)

  // The screen narrows, the words rewrap, and Speak lands under the pointer.
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForTimeout(300)
  expect(await speakAt(), 'Speak did not come back to the same place').toEqual(narrow)
  // A gaze is never quite still: it drifts a pixel or two, which is what tells
  // the browser the pointer is over whatever has just arrived under it.
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(narrow.x + (i % 2), narrow.y + ((i + 1) % 2))
    await page.waitForTimeout(100)
  }
  expect(await said(), 'spoken by nobody').toBe(0)

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

  await page.setViewportSize({ width: 900, height: 900 })
  await box.fill('Could you open the window a little, please, and leave it open until the evening')
  expect(await height(), 'it did not wrap at the narrow width').toBeGreaterThan(oneLine)

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForTimeout(300)
  expect(await height()).toBe(oneLine)
})

/**
 * **The menu is in the upper right corner**, at every width, and the busy
 * indicator — fixed in that corner of the screen, and inert — stands clear of it
 * rather than over the one way into everything else.
 */
for (const width of [360, 1280]) {
  test(`puts the menu in the upper right corner, clear of the busy indicator, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openBoard(page)
    const { menu, card, busyRight } = await page.evaluate(() => {
      const region = document.createElement('div')
      region.className = 'busy-region'
      document.body.append(region)
      const busyRight = region.getBoundingClientRect().right
      region.remove()
      return {
        menu: document.querySelector('[aria-label="Open menu"]')!.getBoundingClientRect().toJSON(),
        card: document.querySelector('.message-wrap')!.getBoundingClientRect().toJSON(),
        busyRight,
      }
    })
    expect(width - menu.right, 'not at the right edge').toBeLessThan(16)
    expect(menu.top, 'not at the top').toBeLessThan(20)
    expect(menu.left, 'not right of the card').toBeGreaterThanOrEqual(card.right)
    expect(busyRight, 'the busy indicator stands over the menu').toBeLessThanOrEqual(menu.left)
  })
}

/**
 * **What is being edited stands at the right end of the line the words are
 * written on** — on the line itself where the card has the width, and on a
 * line of its own under the words, still at the right, where it does not.
 */
for (const [width, beside] of [
  [1280, true],
  [390, false],
] as const) {
  test(`puts what is being edited at the right end of the line, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openBoard(page)
    await page.locator('.edit-toggle').click()
    await page.locator('.text-display').fill('A phrase')
    const { bar, box, line } = await page.evaluate(() => ({
      bar: document.querySelector('.edit-bar')!.getBoundingClientRect().toJSON(),
      box: document.querySelector('.text-display')!.getBoundingClientRect().toJSON(),
      line: document.querySelector('.message-line')!.getBoundingClientRect().toJSON(),
    }))
    expect(line.right - bar.right, 'not at the right end').toBeLessThan(16)
    if (beside) {
      expect(bar.left, 'not after the words').toBeGreaterThanOrEqual(box.right)
      expect(bar.top, 'not on the line').toBeLessThan(box.bottom)
    } else {
      expect(bar.top, 'not under the words').toBeGreaterThanOrEqual(box.bottom - 1)
    }
  })
}
