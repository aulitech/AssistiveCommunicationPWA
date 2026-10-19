// What every test that drives the whole app needs before it can say anything:
// the app on screen, a pointer that travels to what it clicks, and the handful
// of things on that screen every one of them reaches for.
//
// It was the top of one five-thousand-line file, which is what made that file
// hard to leave — a test about linking a voice sat four thousand lines from one
// about the menu because they shared these twenty. They are here now, and the
// tests are in files named after what they are about.
//
// **Importing this installs the fake timers.** Dwell is timer-driven, so every
// test here advances the clock rather than waiting; a file that wants real ones
// wants something other than this.

import { afterEach, beforeEach, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import App from '../../src/App'

// The grid renders a windowful of cells and the table has thousands, so query
// the DOM directly — building an accessibility tree for each lookup is slow.
let container: HTMLElement

export const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
export const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]

export const settle = () => act(() => void vi.advanceTimersByTime(50))

/**
 * A pointer that travelled to what it is clicking, which is what a real one
 * does — and what a tap has to be, since the guards answer a click exactly as
 * they answer a dwell. Somewhere new each time, because the guard the board
 * takes when it rearranges under a live order is held until the pointer is
 * aimed somewhere else.
 */
let pointerAt = 0
export function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

/** The app as it stands, with nothing seeded: the sign-in page, unless a user is stored. */
export function mount() {
  container = render(<App />).container
  settle()
  return container
}

/**
 * Renders straight into the app screen by seeding a signed-in guest. The board
 * opens in auto-speak, whatever was stored; a test about building a message or
 * a phrase turns edit mode on, which is the only other way of working.
 */
export function renderApp(settings: Record<string, unknown> = {}) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify(settings))
  mount()
}

/** No stored settings at all — what somebody opening Peri for the first time gets. */
export function renderFresh() {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  mount()
}

export const message = () => $<HTMLTextAreaElement>('.text-display')!.value
export const cells = () => $$('.phrase-cell')
export const modes = () => $$('.mode-btn')
export const editToggle = () => $('.edit-toggle')!
export const speakToggle = () => $('.autospeak-toggle')!
export const plainCell = (skip: string[] = []) =>
  cells().find(c => !c.querySelector('.phrase-slot') && !skip.includes(c.textContent ?? ''))!

/**
 * Chooses the first option until the picker is done. **Bounded on purpose**: an
 * option that stops answering leaves this spinning rather than failing, and a
 * test that hangs takes the whole suite with it silently — which is exactly what
 * happened when the board began rearranging live and the tap after a phrase was
 * refused until the pointer moved.
 */
export function fillEverySlot() {
  for (let left = 20; left > 0; left--) {
    if (!$('.slot-picker')) return
    click($$('.slot-option')[0])
  }
  throw new Error('the slot picker never closed')
}

export const slotCell = () =>
  cells().find(c => {
    const s = c.querySelector('.phrase-slot')
    return s && !s.classList.contains('is-blank')
  })!

// In edit mode the message box *is* the phrase editor — there is no dialog any
// more — and the rail beside it carries what were the dialog's buttons.
export const box = () => $<HTMLTextAreaElement>('.text-display')!
export const iconBtn = (label: string) =>
  $$<HTMLButtonElement>('.icon-btn').find(b => b.getAttribute('aria-label') === label)

/**
 * The voice control on the box's lower-right corner, which in edit mode is the
 * phrase's own. Settings has a `.voice-trigger` of its own and this is not it.
 */
export const phraseVoice = () =>
  $$('.topbar-choices .choice-btn').find(b => /^voice/i.test(b.getAttribute('aria-label') ?? ''))

export const writeIn = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  settle()
}
export const writePhrase = (value: string) => writeIn(box(), value)
export const savePhrase = () => click(iconBtn('Save phrase'))
/**
 * **The bin on the phrase open in the box** — against the left edge of its
 * cell, or of its button on the emergency bar — and the question it asks first.
 */
export const binOnOpen = () => $('.cell-tools .delete-tool')
/** The tools on the phrase open in the box, which say a phrase is open at all. */
export const toolsOnOpen = () => $('.cell-tools')
/** The far answer in the bin's question: Delete, Take out or Forget. */
export const confirmAsked = () =>
  click([...document.body.querySelectorAll<HTMLElement>('.edit-action-btn.danger')][0])
export const deletePhrase = () => {
  click(binOnOpen())
  confirmAsked()
}

/** What the strip under the box says is being edited. */

export const clearMessage = () => {
  const clear = $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Clear')
  if (clear) click(clear)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/**
 * **Where each cell's place is**, which jsdom will not say: the rows
 * `tests/setup.ts` gives the grid — four across, 80px each, touching — so the
 * arrows over the grid have a cell to be sized by and rows to land a page on.
 * Called before the board renders, since the arrows measure a cell as they
 * mount. Undone after each test, `restoreMocks` being on.
 */
export function placeCells({ width = 150, rowHeight = 80, columns = 4 } = {}) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const nothing = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
    if (!this.classList.contains('phrase-place')) return nothing as DOMRect
    const wrapper = this.closest('.grid-wrapper')
    const at = [...(this.parentElement?.children ?? [])].indexOf(this)
    const top = Math.floor(at / columns) * rowHeight - (wrapper?.scrollTop ?? 0)
    return { ...nothing, y: top, top, bottom: top + rowHeight, right: width, width, height: rowHeight } as DOMRect
  })
}
