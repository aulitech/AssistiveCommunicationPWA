import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App'
import { BLANK, PHRASES, composeWithBlank, hasBlank } from './core/phrases'
import { DEFAULT_SETTINGS } from './core/store'
import { HELP_SECTIONS } from './menu/help'
import { parseBackup } from './core/backup'
import { spoken, lastUtterance, downloads, played, setClipboardText, voices } from './test/setup'

// The grid renders every phrase, so query the DOM directly — building an
// accessibility tree over a couple of thousand cells for each lookup is slow.
let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]

const settle = () => act(() => void vi.advanceTimersByTime(50))

function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  fireEvent.click(el)
  settle()
}

/** Renders straight into the app screen by seeding a signed-in guest. */
function renderApp(settings?: Record<string, unknown>) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  if (settings) localStorage.setItem('dwellspeak_settings', JSON.stringify(settings))
  container = render(<App />).container
  settle()
}

const message = () => $<HTMLTextAreaElement>('.text-display')!.value
const cells = () => $$('.phrase-cell')
const modes = () => $$('.mode-btn')
const editToggle = () => $('.edit-toggle')!
const speakToggle = () => $('.autospeak-toggle')!
const plainCell = (skip: string[] = []) =>
  cells().find(c => !c.querySelector('.phrase-slot') && !skip.includes(c.textContent ?? ''))!
const slotCell = () =>
  cells().find(c => {
    const s = c.querySelector('.phrase-slot')
    return s && !s.classList.contains('is-blank')
  })!
const clearMessage = () => {
  const clear = $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Clear')
  if (clear) click(clear)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('sign-in', () => {
  it('shows the sign-in page when nobody is signed in', () => {
    container = render(<App />).container
    expect($('.signin-page')).not.toBeNull()
    expect($('.app')).toBeNull()
  })

  it('names the app', () => {
    container = render(<App />).container
    expect($('.signin-app-name')?.textContent).toBe('Peri')
  })

  it('lets a guest through to the app', () => {
    container = render(<App />).container
    const guest = $$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest')
    click(guest)
    expect($('.app')).not.toBeNull()
  })

  // Anyone who needs a slow dwell has to be able to set one before signing in.
  it('offers a dwell-time control before sign-in', () => {
    container = render(<App />).container
    expect($('.signin-dwell')).not.toBeNull()
  })
})

describe('reaching the whole sign-in page', () => {
  const pane = () => $('.signin-page .scroll-pane-inner')!
  const arrows = () => $$('.pane-scroll-btn').map(b => b.getAttribute('aria-label'))

  /** jsdom lays nothing out, so the overflow the arrows react to is supplied. */
  const setGeometry = (scrollTop: number, clientHeight: number, scrollHeight: number) => {
    const el = pane()
    for (const [prop, value] of Object.entries({ scrollTop, clientHeight, scrollHeight })) {
      Object.defineProperty(el, prop, { value, configurable: true })
    }
    fireEvent.scroll(el)
    settle()
  }

  const showSignIn = () => {
    container = render(<App />).container
    settle()
  }

  it('scrolls its content rather than the page, so the arrows stay put', () => {
    showSignIn()
    expect($('.signin-page > .scroll-pane')).not.toBeNull()
    expect($('.scroll-pane-inner.signin-content')).not.toBeNull()
  })

  // A dwell user has no wheel and no scrollbar. Content past the fold with no
  // arrows is content that cannot be reached at all — including the only way
  // into the app. A jump comes with each nudge: 500 pixels at 80 a time is six
  // dwells, which is a long way to ask somebody to travel.
  it('offers dwell controls exactly when there is somewhere to go', () => {
    showSignIn()
    expect(arrows()).toEqual([])

    setGeometry(0, 400, 900)
    expect(arrows()).toEqual(['Scroll down', 'Go to bottom'])

    setGeometry(250, 400, 900)
    expect(arrows()).toEqual(['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom'])

    setGeometry(500, 400, 900)
    expect(arrows()).toEqual(['Go to top', 'Scroll up'])
  })

  // Holding a nudge keeps scrolling; a jump has nowhere further to go, so it
  // fires once however long the pointer stays.
  it('repeats the nudges while held, and not the jumps', () => {
    showSignIn()
    setGeometry(250, 400, 900)

    const scrollBy = vi.fn()
    const scrollTo = vi.fn()
    pane().scrollBy = scrollBy
    pane().scrollTo = scrollTo
    const control = (label: string) =>
      $$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === label)!

    for (const nudge of ['Scroll up', 'Scroll down']) {
      scrollBy.mockClear()
      fireEvent.pointerEnter(control(nudge))
      act(() => void vi.advanceTimersByTime(800 + DEFAULT_SETTINGS.repeatDelayMs * 3))
      fireEvent.pointerLeave(control(nudge))
      settle()
      expect(scrollBy.mock.calls.length, `${nudge} did not repeat`).toBeGreaterThan(2)
    }

    fireEvent.pointerEnter(control('Go to bottom'))
    act(() => void vi.advanceTimersByTime(800 + DEFAULT_SETTINGS.repeatDelayMs * 3))
    fireEvent.pointerLeave(control('Go to bottom'))
    settle()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('jumps the whole way when a jump is dwelled', () => {
    showSignIn()
    setGeometry(250, 400, 900)

    const scrollTo = vi.fn()
    pane().scrollTo = scrollTo
    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Go to top'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Go to bottom'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'smooth' })
  })

  it('scrolls the content when one is dwelled', () => {
    showSignIn()
    setGeometry(0, 400, 900)

    const scrollBy = vi.fn()
    pane().scrollBy = scrollBy
    click($('.pane-scroll-btn'))

    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' })
  })
})

describe('resting', () => {
  const rest = () => $('.rest-btn')!
  const dwell = (el: Element, ms = 1500) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(ms))
    settle()
  }
  const startResting = () => click(rest())

  // On the message box rather than over the phrases. It used to be the only
  // thing in that strip and cost the grid nothing; edit and auto-speak have
  // joined it there and the strip is taller for them, but the phrases still
  // start below the topbar rather than under any of it.
  it('sits in the mode strip on the message box, not over the phrases', () => {
    renderApp()
    expect($('.topbar > .topbar-modes > .rest-btn')).not.toBeNull()
    expect($('.grid-area .rest-btn')).toBeNull()
  })

  // Dwell is this app's only input, so without a way to switch it off there is
  // no way to look at the screen without choosing something.
  it('stops a phrase answering to a dwell', () => {
    renderApp()
    startResting()

    dwell(plainCell())

    expect(message()).toBe('')
    expect($('.app')?.classList.contains('resting')).toBe(true)
  })

  // Tap and Enter go through the same gate, or resting would only be resting
  // for one of the three ways a control can fire.
  it('stops a phrase answering to a tap or a key', () => {
    renderApp()
    startResting()

    const cell = plainCell()
    fireEvent.click(cell)
    fireEvent.keyDown(cell, { key: 'Enter' })
    settle()

    expect(message()).toBe('')
  })

  it('stops the emergency phrases too', () => {
    renderApp()
    startResting()
    click($('.emergency-btn'))
    expect(spoken).toEqual([])
  })

  it('lets go again, and everything answers as before', () => {
    renderApp()
    startResting()
    click(rest()) // resume

    expect($('.app')?.classList.contains('resting')).toBe(false)
    click(plainCell())
    expect(message()).not.toBe('')
  })

  // A dwell already part-way through when rest begins would land after it.
  it('abandons a dwell that was already running', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(1000)) // not yet the 1500ms

    startResting()
    act(() => void vi.advanceTimersByTime(2000))

    expect(message()).toBe('')
  })

  // It shows no icon and no word, so the label is the only thing that names it
  // — for a screen reader, and for anyone reading the accessibility tree.
  it('names itself and its state where nothing is drawn', () => {
    renderApp()
    expect(rest().getAttribute('aria-pressed')).toBe('false')
    expect(rest().getAttribute('aria-label')).toMatch(/^Rest\./)

    startResting()

    expect(rest().getAttribute('aria-pressed')).toBe('true')
    expect(rest().getAttribute('aria-label')).toMatch(/^Resume\./)
    expect(rest().classList.contains('is-resting')).toBe(true)
  })
})

describe('choosing a phrase', () => {
  it('composes it into the message', () => {
    renderApp()
    const cell = plainCell()
    click(cell)
    expect(message()).toBe(cell.textContent)
  })

  it('activates by dwell as well as by click', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(1500))
    expect(message()).toBe(cell.textContent)
  })

  it('speaks the composed message with the user settings', () => {
    renderApp({ rate: 1.5, volume: 0.4 })
    click(plainCell())
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')!)
    expect(spoken).toEqual([message()])
    expect(lastUtterance).toMatchObject({ rate: 1.5, volume: 0.4 })
  })
})

describe('fill-in-the-blank phrases', () => {
  it('asks for the wording instead of inserting placeholder text', () => {
    renderApp()
    click(slotCell())

    expect($('.slot-picker')).not.toBeNull()
    expect(message()).toBe('')
    expect($$('.slot-option').length).toBeGreaterThan(0)
  })

  it('inserts the composed sentence once every slot is chosen', () => {
    renderApp()
    click(slotCell())
    while ($('.slot-picker')) click($$('.slot-option')[0])

    expect(message()).not.toMatch(/[{}]/)
    expect(message().length).toBeGreaterThan(0)
  })

  it('can be cancelled without touching the message', () => {
    renderApp()
    click(slotCell())
    click($('.slot-cancel'))

    expect($('.slot-picker')).toBeNull()
    expect(message()).toBe('')
  })
})

describe('auto-speak', () => {
  // The three modes share one strip across the top of the message box, in the
  // order edit, Rest, auto-speak. DOM order is what can be checked here — jsdom
  // lays nothing out — but in a flex row with nothing setting `order` that is
  // also the order they are seen in, left to right.
  it('is off by default, sitting to the right of Rest with edit to its left', () => {
    renderApp()
    const strip = $$('.topbar-modes > *')
    expect(strip.map(el => el.className.split(' ')[0])).toEqual(['mode-btn', 'rest-btn', 'mode-btn'])
    expect(strip[0].getAttribute('aria-label')).toMatch(/edit/i)
    expect(strip[2].getAttribute('aria-label')).toMatch(/auto-speak/i)
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
  })

  it('speaks the phrase and leaves the message alone', () => {
    renderApp({ autoSpeak: true })
    const cell = plainCell()
    click(cell)

    expect(spoken).toEqual([cell.textContent])
    expect(message()).toBe('')
  })

  it('still runs the slot picker, then speaks the result', () => {
    renderApp({ autoSpeak: true })
    click(slotCell())
    expect($('.slot-picker')).not.toBeNull()
    while ($('.slot-picker')) click($$('.slot-option')[0])

    expect(spoken).toHaveLength(1)
    expect(spoken[0]).not.toMatch(/[{}]/)
    expect(message()).toBe('')
  })

  it('goes back to composing when switched off', () => {
    renderApp({ autoSpeak: true })
    click(speakToggle())
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')

    const cell = plainCell()
    click(cell)
    expect(spoken).toEqual([])
    expect(message()).toBe(cell.textContent)
  })

  it('persists across a reload', () => {
    renderApp()
    click(speakToggle())
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).autoSpeak).toBe(true)
  })
})

describe('emergency bar', () => {
  it('speaks immediately, honouring the voice settings', () => {
    renderApp({ rate: 0.8 })
    const first = $('.emergency-btn')!
    click(first)

    expect(spoken).toEqual([first.textContent])
    expect(lastUtterance).toMatchObject({ rate: 0.8 })
  })

  it('is reachable by keyboard', () => {
    renderApp()
    const first = $('.emergency-btn')!
    fireEvent.keyDown(first, { key: 'Enter' })
    settle()
    expect(spoken).toEqual([first.textContent])
  })

  it('never composes into the message', () => {
    renderApp()
    click($('.emergency-btn'))
    expect(message()).toBe('')
  })
})

// Regression guard, and the destructive kind: the editor used to open on
// `phrase.text`, which has had its slots resolved into labels. Opening a
// fill-in-the-blank phrase showed "I want the red/blue one" and saving it stored
// exactly that — flattening the slot, with no way back and nothing said about it.
describe('editing a phrase that has choices behind it', () => {
  const enterEditMode = () => click(editToggle())
  const save = () => click($$('.edit-action-btn').find(b => b.textContent?.includes('Save')))

  it('opens on what the phrase was written as, brackets and all', () => {
    renderApp()
    enterEditMode()
    const cell = slotCell()
    const shown = cell.textContent!
    click(cell)

    const source = $<HTMLTextAreaElement>('.edit-modal-text')!.value
    expect(source).toMatch(/\{.*\}/)
    expect(source).not.toBe(shown)
  })

  // The property that actually matters. Opening a phrase to look at it and
  // saving it unchanged must leave it exactly as capable as it was.
  //
  // Pinned to the one phrase that was edited, by the text it shows: flattening
  // leaves that text identical — it is what the editor was showing — so asking
  // `slotCell()` again just finds the next phrase that still has its slot, and
  // answers about the wrong one.
  it('still offers the choices after being opened and saved unchanged', () => {
    renderApp()
    enterEditMode()
    const shown = slotCell().textContent!
    click(slotCell())
    save()

    const after = cells().find(c => c.textContent === shown)!
    expect(after, 'the edited phrase is no longer on the board').toBeDefined()
    expect(
      after.querySelector('.phrase-slot'),
      'the slot was flattened by opening the editor and saving',
    ).not.toBeNull()

    click(editToggle()) // leave edit mode
    click(cells().find(c => c.textContent === shown))
    expect($('.slot-picker')).not.toBeNull()
  })
})

// A text box was the one control dwell alone could not drive: hovering could
// focus it, but the caret only moved when something was clicked — and a click is
// the input a gaze user does not have. Typing comes from whatever keyboard they
// already use; saying *where* to type is the part no keyboard supplies.
describe('placing the caret in a phrase by dwell', () => {
  const enterEditMode = () => click(editToggle())
  const field = () => $<HTMLTextAreaElement>('.edit-modal-text')!
  /** jsdom implements neither caret API, so the browser's answer is stubbed. */
  const answers = (offset: number) =>
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: field(), offset }) })
  /** Arriving over the box — the pointer was somewhere else entirely. */
  const aimAt = (x: number, y: number) => {
    fireEvent.pointerEnter(field(), { clientX: x, clientY: y })
    fireEvent.pointerMove(field(), { clientX: x, clientY: y })
    act(() => void vi.advanceTimersByTime(900))
    settle()
  }
  /**
   * Moving to another part of the same box. Deliberately no `pointerEnter`:
   * a pointer travelling within an element only ever fires `pointermove`, and
   * re-entering would re-arm the dwell all by itself — which is what made an
   * earlier version of the test below pass with the re-arming taken out.
   */
  const moveTo = (x: number, y: number) => {
    fireEvent.pointerMove(field(), { clientX: x, clientY: y })
    act(() => void vi.advanceTimersByTime(900))
    settle()
  }
  /**
   * The same journey as `moveTo`, but taken the way a pointer actually takes
   * it: in steps too small to count as aiming somewhere new on their own.
   */
  const driftTo = (x: number, y: number) => {
    for (let at = 200 + 4; at <= x; at += 4) fireEvent.pointerMove(field(), { clientX: at, clientY: y })
    act(() => void vi.advanceTimersByTime(900))
    settle()
  }

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).caretPositionFromPoint
  })

  const openEditor = () => {
    renderApp()
    enterEditMode()
    click(plainCell())
  }

  it('puts the caret where the pointer settled', () => {
    openEditor()
    answers(5)
    aimAt(200, 100)

    expect(field().selectionStart).toBe(5)
    expect(field().selectionEnd).toBe(5)
    expect(document.activeElement).toBe(field())
  })

  // A dwell fires once on arrival, so without this the caret could be placed
  // only by leaving the box and coming back.
  it('follows the pointer to somewhere else in the phrase', () => {
    openEditor()
    answers(5)
    aimAt(200, 100)

    answers(2)
    moveTo(260, 100)
    expect(field().selectionStart).toBe(2)
  })

  // Regression: the threshold was measured against the previous movement rather
  // than against where the wait began. A pointer does not jump — it crosses the
  // box in small steps, none of them far enough on its own — so the distance
  // never added up, the dwell never re-armed, and leaving the box and coming
  // back was the only way to place the caret a second time.
  it('follows a pointer that crosses the phrase in small steps', () => {
    openEditor()
    answers(5)
    aimAt(200, 100)

    answers(2)
    driftTo(260, 100)
    expect(field().selectionStart, 'the caret stayed where it first landed').toBe(2)
  })

  // Gaze never holds perfectly still. Re-arming on every pixel of drift would
  // mean the dwell never completed at all.
  it('is not restarted by the wobble of holding still', () => {
    openEditor()
    answers(7)
    fireEvent.pointerEnter(field(), { clientX: 200, clientY: 100 })
    // Most of the wait, a small wobble, then the rest of it.
    act(() => void vi.advanceTimersByTime(600))
    fireEvent.pointerMove(field(), { clientX: 204, clientY: 97 })
    act(() => void vi.advanceTimersByTime(300))
    settle()

    expect(field().selectionStart).toBe(7)
  })

  // Focus is worth having even where the browser will not say which character
  // was meant: it is the difference between a box that can be typed into at all
  // and one that cannot.
  it('still focuses the box where the browser will not say', () => {
    openEditor()
    aimAt(200, 100)

    expect(document.activeElement).toBe(field())
    expect($('.edit-modal')).not.toBeNull()
  })

  // The hook's own key handling cancels Space so it cannot scroll the grid.
  // Spread onto a box people type into, the first space typed would vanish.
  it('does not swallow a space typed into the phrase', () => {
    openEditor()
    fireEvent.keyDown(field(), { key: ' ' })
    fireEvent.change(field(), { target: { value: 'two words' } })
    settle()

    expect(field().value).toBe('two words')
  })
})

describe('edit mode', () => {
  // Regression guard: visiblePhrases omitted mainPhrases from its dependency
  // array, so the grid kept showing the old text until the filter moved.
  it('shows an edited phrase immediately', () => {
    renderApp()
    click(editToggle())

    const before = cells()[0].textContent
    click(cells()[0])
    fireEvent.change($('.edit-modal-text')!, { target: { value: 'EDITED PHRASE' } })
    settle()
    click($$('.edit-action-btn').find(b => b.textContent?.includes('Save')))

    expect(cells()[0].textContent).toBe('EDITED PHRASE')
    expect(cells()[0].textContent).not.toBe(before)
  })

  it('adds an emergency phrase', () => {
    renderApp()
    click(editToggle())
    expect($('.emergency-add')).not.toBeNull()

    const before = $$('.emergency-btn').length
    click($('.emergency-add'))
    expect($('.edit-modal-title')?.textContent).toMatch(/emergency/i)

    fireEvent.change($('.edit-modal-text')!, { target: { value: 'I need my inhaler' } })
    settle()
    click($$('.edit-action-btn').find(b => b.textContent?.includes('Save')))

    const labels = $$('.emergency-btn .emergency-label').map(e => e.textContent)
    expect($$('.emergency-btn')).toHaveLength(before + 1)
    expect(labels).toContain('I need my inhaler')
  })

  it('removes a deleted phrase from the grid', () => {
    renderApp()
    click(editToggle())

    const doomed = cells()[0].textContent
    click(cells()[0])
    click($$('.edit-action-btn').find(b => b.textContent?.includes('Delete')))

    expect(cells()[0].textContent).not.toBe(doomed)
  })

  it('toggles independently of auto-speak', () => {
    renderApp()
    click(editToggle())
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
  })
})

describe('adding a phrase from the message box', () => {
  const composer = () => $<HTMLTextAreaElement>('.text-display')!
  const modalText = () => $<HTMLTextAreaElement>('.edit-modal-text')?.value
  const enterEditMode = () => click(editToggle())
  const dwell = (el: Element) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(800))
    settle()
  }
  const compose = (value: string) => {
    fireEvent.change(composer(), { target: { value } })
    settle()
  }

  // Regression guard: the message box is the only way to add an ordinary
  // phrase, and it used to answer to a click alone — the one input a
  // dwell-only user cannot produce.
  it('opens the editor on hover and hold', () => {
    renderApp()
    enterEditMode()
    dwell(composer())
    expect($('.edit-modal-title')?.textContent).toBe('Add phrase')
  })

  it('opens the editor from the keyboard, for switch access', () => {
    renderApp()
    enterEditMode()
    fireEvent.keyDown(composer(), { key: 'Enter' })
    settle()
    expect($('.edit-modal-title')?.textContent).toBe('Add phrase')
  })

  it('carries the composed message into the editor', () => {
    renderApp()
    compose('  Please pass me the water  ')
    enterEditMode()
    dwell(composer())
    expect(modalText()).toBe('Please pass me the water')
  })

  it('saves the carried message as a real phrase', () => {
    renderApp()
    compose('Please pass me the water')
    enterEditMode()
    dwell(composer())
    click($$('.edit-action-btn').find(b => b.textContent?.includes('Save')))
    clearMessage()
    click(editToggle()) // leave edit mode

    expect(cells().map(c => c.textContent)).toContain('Please pass me the water')
  })

  it('opens an empty editor when nothing is composed', () => {
    renderApp()
    enterEditMode()
    dwell(composer())
    expect(modalText()).toBe('')
  })

  // Outside edit mode the box is for typing, so a hold must not open the editor
  // while the user is mid-message.
  it('does not open the editor outside edit mode', () => {
    renderApp()
    dwell(composer())
    expect($('.edit-modal')).toBeNull()
  })

  // Wiring the dwell key handler unconditionally would swallow Space, which the
  // hook cancels to stop the grid scrolling — in the one place people type.
  it('does not swallow Space while composing', () => {
    renderApp()
    expect(fireEvent.keyDown(composer(), { key: ' ' })).toBe(true)
    expect($('.edit-modal')).toBeNull()
  })
})

describe('placing the caret in the message box by dwell', () => {
  const composer = () => $<HTMLTextAreaElement>('.text-display')!
  const dwell = (el: Element) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(800))
    settle()
  }
  /** jsdom implements neither caret API, so the browser's answer is stubbed. */
  const answers = (offset: number) =>
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: composer(), offset }) })
  /** Aiming somewhere else in the same box: a move, never a re-entry. */
  const moveTo = (x: number) => {
    fireEvent.pointerMove(composer(), { clientX: x, clientY: 100 })
    act(() => void vi.advanceTimersByTime(900))
    settle()
  }

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).caretPositionFromPoint
  })

  // Placing the caret to type meant clicking the box, which a dwell-only user
  // cannot do — the message was theirs to build but not to correct.
  it('gives it focus after a hold', () => {
    renderApp()
    expect(document.activeElement).not.toBe(composer())
    dwell(composer())
    expect(document.activeElement).toBe(composer())
  })

  it('puts the caret where the pointer settled', () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'I am cold' } })
    answers(4)
    dwell(composer())

    expect(composer().selectionStart).toBe(4)
    expect(composer().selectionEnd).toBe(4)
  })

  it('shows the hold progressing', () => {
    renderApp()
    fireEvent.pointerEnter(composer())
    act(() => void vi.advanceTimersByTime(400))
    expect(composer().classList.contains('dwelling')).toBe(true)
  })

  // The box used to stop arming altogether once it held focus, which made the
  // caret placeable exactly once — on the way in — and never again. Aiming is
  // what settles that instead, so the dwell stays live while the box is in use.
  it('still places the caret once the box holds focus', () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'I am cold' } })
    answers(4)
    dwell(composer())
    expect(composer().selectionStart).toBe(4)

    answers(7)
    moveTo(260)
    expect(composer().selectionStart, 'the box stopped arming once focused').toBe(7)
  })

  // What the focus gate was really protecting: a pointer parked on the box
  // while its owner types must not sit there firing and dragging the caret
  // away from where they are working.
  it('leaves the caret alone while the pointer rests', () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'I am cold' } })
    answers(4)
    dwell(composer())

    answers(1)
    act(() => void vi.advanceTimersByTime(3000))
    settle()
    expect(composer().selectionStart).toBe(4)
  })

  // The bar is a CSS animation timed off this variable. Without it the
  // animation falls back to a fixed 800ms and drifts away from the real hold
  // for anyone who has changed their dwell time.
  it('paces the bar to the configured dwell time', () => {
    renderApp({ actionDwellMs: 2000 })
    expect(composer().style.getPropertyValue('--dwell-duration')).toBe('2000ms')
  })

  // The caret decides which word the grid narrows itself to, and it is tracked
  // in state rather than read off the box, so a caret moved by dwell rather
  // than by typing has to reach that state as well.
  //
  // This asserts the outcome and cannot isolate how it is reached: jsdom
  // answers `setSelectionRange` with a `selectionchange` that React turns into
  // `onSelect`, which is already wired to the same setter, so the hook's own
  // `onPlace` can be pulled out and this still passes. `ui/caret.test.tsx` is
  // what holds that, and says why it is worth holding.
  it('narrows the grid to the word the caret was moved into', () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'zzzz help' } })
    settle()
    const onHelp = cells().length

    answers(2) // inside "zzzz", which nothing completes
    dwell(composer())
    expect(cells().length, 'the grid stayed on the word the caret left').toBeLessThan(onHelp)
  })
})

// How fast a held control fires again — the scroll nudges, the filter arrows, the
// settings spinners. The wait before the *first* fire is the action dwell, the
// same as any other control; this is only the gap between that one and the next.
// It was two hardcoded numbers, 180 and 200, until it became a setting.
describe('the auto-repeat delay', () => {
  const railBtn = (label: string) =>
    $$('.grid-scrollbar .scroll-btn').find(b => b.getAttribute('aria-label') === label)!
  const settingRow = (label: string) =>
    $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === label)!

  it('paces the repeats of a held control', () => {
    renderApp({ actionDwellMs: 300, repeatDelayMs: 500 })
    const scrollBy = vi.fn()
    $<HTMLElement>('.grid-wrapper')!.scrollBy = scrollBy

    fireEvent.pointerEnter(railBtn('Scroll down'))
    act(() => void vi.advanceTimersByTime(300)) // the dwell itself, not a repeat
    expect(scrollBy).toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(499))
    expect(scrollBy, 'repeated before the delay was up').toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(1))
    expect(scrollBy).toHaveBeenCalledTimes(2)
  })

  // Separate from the dwell time because they answer different questions: the
  // dwell is how long somebody needs to settle on a target, this is how fast they
  // travel once they have. A long dwell with quick repeats is a real combination.
  it('is set independently of the action dwell', () => {
    renderApp({ actionDwellMs: 2000, repeatDelayMs: 100 })
    const scrollBy = vi.fn()
    $<HTMLElement>('.grid-wrapper')!.scrollBy = scrollBy

    fireEvent.pointerEnter(railBtn('Scroll down'))
    act(() => void vi.advanceTimersByTime(1999))
    expect(scrollBy, 'fired before the long dwell was up').not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1 + 300))
    expect(scrollBy.mock.calls.length, 'the quick repeats did not follow').toBeGreaterThan(3)
  })

  it('is offered in Settings and kept', () => {
    renderApp()
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Open menu'))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))

    const row = settingRow('Auto-repeat')
    expect(row, 'no Auto-repeat row in Settings').toBeDefined()
    click([...row.querySelectorAll('.step-btn')].find(b => b.getAttribute('aria-label') === 'Increase'))

    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).repeatDelayMs).toBe(
      DEFAULT_SETTINGS.repeatDelayMs + 50,
    )
  })
})

describe('composing', () => {
  it('undoes back to the previous message', () => {
    renderApp()
    const cell = plainCell()
    click(cell)
    clearMessage()
    expect(message()).toBe('')

    const undo = $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Undo')
    click(undo)
    expect(message()).toBe(cell.textContent)
  })

  it('filters the grid by the word being typed', () => {
    renderApp()
    const before = cells().length
    fireEvent.change($('.text-display')!, { target: { value: 'hungry' } })
    settle()
    expect(cells().length).toBeLessThan(before)
    expect(cells().length).toBeGreaterThan(0)
  })

  it('reports a successful copy', () => {
    renderApp()
    click(plainCell())
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Copy to clipboard')!)
    act(() => void vi.advanceTimersByTime(50))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(message())
  })
})

describe('my details', () => {
  const openProfile = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'My details'))
  }
  const cellTexts = () => cells().map(c => c.textContent)

  it('opens from the menu', () => {
    renderApp()
    openProfile()
    expect($('.profile-input')).not.toBeNull()
    expect($('.profile-empty')?.textContent).toMatch(/nobody/i)
  })

  it('fills in a name phrase that was previously a blank', () => {
    renderApp()
    // `BLANK` is empty, so the unfilled phrase is its words and the gap after
    // them — the trailing space is where the name goes.
    expect(cellTexts()).toContain(`This is ${BLANK}`)

    openProfile()
    fireEvent.change($('input[aria-label="Nickname"]')!, { target: { value: 'Ada' } })
    settle()

    expect(cellTexts()).toContain('This is Ada')
    expect(cellTexts()).not.toContain(`This is ${BLANK}`)
  })

  it('adds a contact and offers it on the matching phrase', () => {
    renderApp()
    openProfile()

    fireEvent.change($('input[aria-label="Add a contact"]')!, { target: { value: 'Mum' } })
    settle()
    click($('.contact-add-btn'))

    expect($$('.contact-name').map(c => c.textContent)).toEqual(['Mum'])
    // A lone contact needs no picker — it goes straight into the phrase.
    expect(cellTexts().some(t => t?.includes('call Mum'))).toBe(true)
  })

  it('asks which contact once there is more than one', () => {
    renderApp()
    openProfile()
    for (const name of ['Mum', 'Dad']) {
      fireEvent.change($('input[aria-label="Add a contact"]')!, { target: { value: name } })
      settle()
      click($('.contact-add-btn'))
    }
    click($('.panel-back'))
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))

    const callCell = cells().find(c => /going to call/.test(c.textContent ?? ''))!
    click(callCell)

    expect($('.slot-picker')).not.toBeNull()
    expect($$('.slot-option').map(o => o.textContent)).toEqual(['Mum', 'Dad'])
    click($$('.slot-option')[1])
    expect(message()).toContain('Dad')
  })

  it('removes a contact', () => {
    renderApp()
    openProfile()
    fireEvent.change($('input[aria-label="Add a contact"]')!, { target: { value: 'Mum' } })
    settle()
    click($('.contact-add-btn'))
    expect($$('.contact-name')).toHaveLength(1)

    click($('.contact-remove'))
    expect($$('.contact-name')).toHaveLength(0)
  })

  it('refuses blank and duplicate contacts', () => {
    renderApp()
    openProfile()

    click($('.contact-add-btn'))
    expect($$('.contact-name')).toHaveLength(0)

    for (let i = 0; i < 2; i++) {
      fireEvent.change($('input[aria-label="Add a contact"]')!, { target: { value: 'Mum' } })
      settle()
      click($('.contact-add-btn'))
    }
    expect($$('.contact-name')).toHaveLength(1)
  })

  it('persists across a reload', () => {
    renderApp()
    openProfile()
    fireEvent.change($('input[aria-label="Nickname"]')!, { target: { value: 'Ada' } })
    settle()

    expect(JSON.parse(localStorage.getItem('dwellspeak_profile')!).name.nickname).toBe('Ada')
  })
})

describe('help', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const back = () => $('.panel-back')

  it('is offered in the menu', () => {
    renderApp()
    openMenu()
    expect(nav('Help')).toBeDefined()
    expect(nav('Help')?.textContent).toMatch(/how to use/i)
  })

  it('opens the guide', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    expect($('.help-panel')).not.toBeNull()
    expect($('.help-title')?.textContent).toMatch(/peri/i)
    expect($$('.help-section').length).toBe(HELP_SECTIONS.length)
  })

  // The panel spans the full viewport, so without a constrained column the
  // guide's lines run the whole width of a wide monitor.
  it('keeps the prose in a reading column', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    const measure = $('.help-measure')
    expect(measure).not.toBeNull()
    // Every piece of prose sits inside it, not loose in the scroll area.
    for (const el of [...$$('.help-text'), ...$$('.help-list'), ...$$('.help-section')]) {
      expect(measure!.contains(el)).toBe(true)
    }
  })

  // Every heading is always there — folded up, the guide is a list of what it
  // can tell you, which is how somebody finds the one thing they came for.
  it('renders every section heading', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    const headings = $$('.help-section-title').map(h => h.textContent)
    expect(headings).toEqual(HELP_SECTIONS.map(s => s.title))
  })

  describe('folding up', () => {
    const showHelp = () => {
      renderApp()
      openMenu()
      click(nav('Help'))
    }
    const heading = (title: string) =>
      $$('.help-section-title').find(h => h.textContent === title)!
    const openTitles = () =>
      $$('.help-section.is-open .help-section-title').map(h => h.textContent)
    const bodyCount = () => $$('.help-text').length + $$('.help-list').length

    // Open on arrival, so the guide says something rather than only listing what
    // it could say — and the titles of everything else are visible below it.
    it('opens on the first section and no other', () => {
      showHelp()
      expect(openTitles()).toEqual([HELP_SECTIONS[0].title])
      expect(HELP_SECTIONS[0].title).toBe('Overview')
    })

    it('opens the one chosen and closes the one that was open', () => {
      showHelp()
      click(heading('Settings'))

      expect(openTitles()).toEqual(['Settings'])
      expect($$('.help-section.is-open .help-text').length).toBeGreaterThan(0)
    })

    it('closes the open one when it is chosen again', () => {
      showHelp()
      click(heading('Overview'))

      expect(openTitles()).toEqual([])
      expect(bodyCount(), 'a closed guide still had prose in it').toBe(0)
    })

    // Unmounted rather than hidden. Left in the tree, a screen reader would read
    // out fifteen sections the user has closed.
    it("keeps only the open section's prose in the page", () => {
      showHelp()
      const all = HELP_SECTIONS.reduce((n, s) => n + s.blocks.length, 0)
      expect(bodyCount()).toBeLessThan(all)
      expect(bodyCount()).toBe(HELP_SECTIONS[0].blocks.length)
    })

    // The legal pages are the same shape of text drawn by the same component,
    // and they are documents: served at their own URLs, indexed, read by people
    // checking one clause. Folding them would hide most of what they exist to say.
    it('leaves the legal pages open', () => {
      // Restored in `finally`: leaving the URL at /privacy makes every test
      // after this one render the privacy policy instead of the app.
      try {
        window.history.pushState({}, '', '/privacy')
        container = render(<App />).container
        settle()

        expect($('.help-section.is-collapsible')).toBeNull()
        expect($$('.help-section-title').length).toBeGreaterThan(1)
        expect($$('.help-text').length).toBeGreaterThan(5)
      } finally {
        window.history.pushState({}, '', '/')
      }
    })
  })

  // Settings and the guide take the whole screen; the menu and the shorter
  // panels hang down only as far as their content. jsdom lays nothing out, so
  // the class is what can be checked — the height it carries is the preview's
  // question.
  it.each([
    ['Settings', true],
    ['Help', true],
    ['My details', false],
    ['Backup & sharing', false],
  ])('gives %s the full viewport: %s', (panel, tall) => {
    renderApp()
    openMenu()
    expect($('.top-panel')?.classList.contains('is-tall'), 'the menu itself is not tall').toBe(false)

    click(nav(panel))
    expect($('.top-panel')?.classList.contains('is-tall')).toBe(tall)
  })

  it('goes back to the menu', () => {
    renderApp()
    openMenu()
    click(nav('Help'))
    click(back())

    expect($('.help-panel')).toBeNull()
    expect(nav('Help')).toBeDefined()
  })

  it('reopens on the menu rather than back inside the guide', () => {
    renderApp()
    openMenu()
    click(nav('Help'))
    openMenu() // close
    openMenu() // reopen

    expect($('.help-panel')).toBeNull()
  })
})

describe('the scroll rail', () => {
  const railBtn = (label: string) => $$('.scroll-btn').find(b => b.getAttribute('aria-label') === label)

  // A dwell user has no wheel and no scrollbar, so this rail is the only way
  // down a grid of two thousand phrases. Nothing else checks it is wired to the
  // grid rather than to whatever it was last pointed at.
  it('scrolls the grid it sits beside', () => {
    renderApp()
    const grid = $('.grid-wrapper')!
    const scrollBy = vi.fn()
    const scrollTo = vi.fn()
    grid.scrollBy = scrollBy
    grid.scrollTo = scrollTo

    click(railBtn('Scroll down'))
    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' })

    click(railBtn('Scroll up'))
    expect(scrollBy).toHaveBeenLastCalledWith({ top: -120, behavior: 'smooth' })

    click(railBtn('Scroll to top'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  // Three sizes of jump on one rail: a nudge, a page, and the end. The page is
  // the one that was missing — nudging 120px at a time down two thousand phrases
  // is a long way, and jumping to the bottom overshoots everything in between.
  describe('a page at a time', () => {
    /** jsdom lays nothing out, so the height a page is measured from is supplied. */
    const withHeight = (h: number) => {
      const grid = $<HTMLElement>('.grid-wrapper')!
      Object.defineProperty(grid, 'clientHeight', { value: h, configurable: true })
      const scrollBy = vi.fn()
      grid.scrollBy = scrollBy
      return scrollBy
    }

    // One nudge's worth stays on screen. Rows are not a uniform height here, so
    // a jump of exactly one screen can leave a row split across the fold — and a
    // phrase half off the top of the page is one somebody may not know is there.
    it('moves a screenful less one nudge, in both directions', () => {
      renderApp()
      const scrollBy = withHeight(600)

      click(railBtn('Next page'))
      expect(scrollBy).toHaveBeenCalledWith({ top: 480, behavior: 'smooth' })

      click(railBtn('Previous page'))
      expect(scrollBy).toHaveBeenLastCalledWith({ top: -480, behavior: 'smooth' })
    })

    // A grid shorter than the overlap would otherwise page by nothing at all.
    it('still moves when the grid is shorter than the overlap', () => {
      renderApp()
      const scrollBy = withHeight(80)

      click(railBtn('Next page'))
      expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'smooth' })
    })

    // Repeats while held, like the nudges, and paced by the same auto-repeat
    // setting — so a screenful a second is a choice the user can make rather than
    // one this file makes for them.
    it('keeps paging while the pointer stays', () => {
      renderApp({ actionDwellMs: 800, repeatDelayMs: 500 })
      const scrollBy = withHeight(600)

      fireEvent.pointerEnter(railBtn('Next page')!)
      act(() => void vi.advanceTimersByTime(800))
      expect(scrollBy).toHaveBeenCalledTimes(1)

      act(() => void vi.advanceTimersByTime(1500))
      expect(scrollBy.mock.calls.length, 'the page control did not repeat').toBe(4)
      expect(scrollBy).toHaveBeenLastCalledWith({ top: 480, behavior: 'smooth' })
    })
  })
})

describe('a phrase with a blank', () => {
  // The blank is there to be typed into, and a dwell user cannot place a caret
  // by clicking — so putting it in the gap is the whole of that feature.
  //
  // Found by the drawn gap rather than by looking for `BLANK` in the text: a
  // blank leaves no characters behind, and a text search for an empty string
  // matches the first cell on the board whether it has one or not.
  it('lands the caret in the gap, ready to type into', () => {
    // A shipped phrase whose gap has words after it in the *composed* text, so
    // "the caret went to the end" is a different answer from "it went to the
    // gap". Picked from the table rather than the DOM: a cell draws the segments
    // it was given, and composing tidies them — one ending "for {}." draws a
    // full stop after the gap that the text it produces does not have.
    const midBlank = PHRASES.find(p => {
      const { text, blankAt } = composeWithBlank(p.segments)
      return hasBlank(p.segments) && blankAt >= 0 && blankAt < text.length
    })!
    expect(midBlank, 'no phrase on the board has a gap with words after it').toBeDefined()

    renderApp()
    const blankCell = cells().find(c => c.getAttribute('aria-label') === midBlank.text)!
    click(blankCell)
    settle()

    const box = $<HTMLTextAreaElement>('.text-display')!
    const before = box.value.slice(0, box.selectionStart)
    const after = box.value.slice(box.selectionEnd)

    // Nothing is selected: there are no characters to type over, only a place.
    expect(box.selectionStart).toBe(box.selectionEnd)
    expect(after, 'the caret went to the end rather than the gap').not.toBe('')

    // The property that matters, and the one the old selected `___` gave for
    // free: a word typed here needs no spacing of its own. Asserted as tidiness
    // rather than as "a space either side", because a gap before punctuation
    // correctly has no space after it — "Did you see ?" takes the name straight
    // in front of the question mark.
    const typed = before + 'Mum' + after
    expect(typed).toContain('Mum')
    expect(typed, 'a word typed into the gap did not sit cleanly').toBe(
      typed.replace(/ {2,}/g, ' ').replace(/ +([,.?!])/g, '$1'),
    )
  })

  it('sits at the end when there is no blank to land on', () => {
    renderApp()
    click(plainCell())
    settle()

    const box = $<HTMLTextAreaElement>('.text-display')!
    expect(box.selectionStart).toBe(box.value.length)
    expect(box.selectionStart).toBe(box.selectionEnd)
  })
})

describe('backup & sharing', () => {
  const STORE_KEY = 'dwellspeak_phrase_store_v2'
  const MINE = { id: 'custom-seed', text: 'Put the kettle on', category: 'Kitchen' }

  const seed = (store: Record<string, unknown>) => localStorage.setItem(STORE_KEY, JSON.stringify(store))
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const openBackup = () => {
    openMenu()
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
  }
  const btn = (label: string) => $$('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  // The scope picker is a portalled grid, so it is not under the render container.
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const scopeTrigger = () => $('.backup-scope-trigger')
  const tile = (name: string) =>
    inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').split(' · ')[0] === name)
  const modalAction = (label: string) =>
    inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  /** Opens the grid, ticks each name, and closes it. */
  const chooseScope = (...names: string[]) => {
    click(scopeTrigger())
    for (const name of names) click(tile(name))
    click(modalAction('Done'))
  }
  /** Dwells "Save a file" and reads back the file that came out. */
  const saved = () => {
    click(btn('Save a file'))
    const file = downloads[downloads.length - 1]
    const result = parseBackup(file.text)
    if (!result.ok) throw new Error(result.error)
    return { ...file, backup: result.backup }
  }
  /** The file readers are promise-based; fake timers do not hold up microtasks. */
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }
  const cellTexts = () => cells().map(c => c.textContent)

  it('is offered in the menu', () => {
    renderApp()
    openMenu()
    const item = $$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing')
    expect(item).toBeDefined()
    expect(item?.textContent).toMatch(/save your phrases/i)
  })

  it('offers the whole app or any one category, Emergency included', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    click(scopeTrigger())
    const names = inDoc('.picker-tile').map(el => (el.getAttribute('aria-label') ?? '').split(' · ')[0])
    expect(names[0]).toBe('Everything')
    expect(names).toContain('Kitchen')
    // The emergency bar has no tab of its own, so nothing else here would let
    // its phrases be exported on their own.
    expect(names).toContain('Emergency')
    expect(tile('Everything')?.getAttribute('aria-selected')).toBe('true')
  })

  // Several categories at once is the point of a grid rather than a dropdown,
  // and the whole reason the tiles toggle instead of choosing.
  it('takes more than one category at a time', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen', 'Night')

    expect(scopeTrigger()?.textContent).toContain('Kitchen, Night')
    expect(saved().backup.scope).toEqual(['Kitchen', 'Night'])
  })

  it('unticking the last one goes back to everything', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    expect(scopeTrigger()?.textContent).toContain('Kitchen')

    chooseScope('Kitchen') // ticked, then unticked
    expect(scopeTrigger()?.textContent).toContain('Everything')
    expect(saved().backup.scope).toBeNull()
  })

  // Trying a selection has to be free, the same way trying a voice is.
  it('puts the choice back when the grid is cancelled', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    click(scopeTrigger())
    click(tile('Night'))
    click(modalAction('Cancel'))

    expect(scopeTrigger()?.textContent).toContain('Kitchen')
    expect(saved().backup.scope).toEqual(['Kitchen'])
  })

  // Colour alone is a poor thing to read a whole grid by, and here several can
  // be on at once.
  it('marks the ticked ones with more than a colour', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    click(scopeTrigger())
    click(tile('Kitchen'))

    expect(tile('Kitchen')?.querySelector('.picker-tile-check')).not.toBeNull()
    expect(tile('Emergency')?.querySelector('.picker-tile-check')).toBeNull()
  })

  it('saves a file carrying the phrases the user wrote', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    const { filename, backup } = saved()
    expect(filename).toMatch(/^peri-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(backup.added).toContainEqual(MINE)
    expect(backup.scope).toBeNull()
  })

  it('narrows the file to the categories that are ticked', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    const { filename, backup } = saved()
    expect(backup.scope).toEqual(['Kitchen'])
    expect(backup.added).toEqual([MINE])
    expect(filename).toBe(`peri-Kitchen-${backup.exported.slice(0, 10)}.json`)
  })

  it('copies the same file to the clipboard', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    click(btn('Copy'))
    settle()
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const result = parseBackup(written)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.added).toContainEqual(MINE)
  })

  // The whole point of the feature: a phrase written on one device turning up
  // on another one that has never seen it.
  it('brings a pasted backup in', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    // A second, empty device.
    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    expect(cellTexts()).not.toContain(MINE.text)

    openBackup()
    setClipboardText(file)
    click(btn('Paste a backup'))
    await flush()

    expect($('.backup-incoming')).not.toBeNull()
    click(btn("Add to what's here"))
    await flush()

    expect(cellTexts()).toContain(MINE.text)
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!).custom).toContainEqual(MINE)
  })

  it('brings in a backup chosen from a file', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    openBackup()

    const input = $<HTMLInputElement>('.backup-file-input')!
    fireEvent.change(input, { target: { files: [new File([file], 'peri-backup.json', { type: 'application/json' })] } })
    await flush()
    click(btn("Add to what's here"))
    await flush()

    expect(cellTexts()).toContain(MINE.text)
  })

  it('says why when the file is not a backup, and imports nothing', async () => {
    renderApp()
    openBackup()

    setClipboardText('{"hello":"world"}')
    click(btn('Paste a backup'))
    await flush()

    expect($('.backup-error')?.textContent).toMatch(/isn't a Peri backup/i)
    expect($('.backup-incoming')).toBeNull()
  })

  // Replacing means making the device match the file, so a file covering one
  // category must not be able to take everything else with it.
  it('offers replacing only for a whole backup', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    chooseScope('Kitchen')
    const { text: partial } = saved()
    chooseScope('Everything')
    const { text: whole } = saved()

    setClipboardText(partial)
    click(btn('Paste a backup'))
    await flush()
    expect(btn('Replace everything')).toBeUndefined()

    click(btn('Cancel'))
    setClipboardText(whole)
    click(btn('Paste a backup'))
    await flush()
    expect(btn('Replace everything')).toBeDefined()
  })

  it('closes the menu onto the restored phrases', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    openBackup()
    setClipboardText(file)
    click(btn('Paste a backup'))
    await flush()
    click(btn("Add to what's here"))
    await flush()

    expect($('.top-panel.open')).toBeNull()
    expect($('.toast')?.textContent).toMatch(/merged/i)
  })
})

describe('leaving a panel', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const back = () => $('.panel-back')
  const isOpen = () => $('.top-panel.open') !== null
  const PANELS = ['Settings', 'My details', 'Backup & sharing', 'Help']
  const SCREENS = ['Menu', ...PANELS]

  const show = (screen: string) => {
    renderApp()
    openMenu()
    if (screen !== 'Menu') click(nav(screen))
  }

  // The panels are different heights, and the way out used to sit under their
  // content — so it moved whenever the content did. A target a gaze user has to
  // find again each time is a poor one, so it lives in the row above instead,
  // which is the same place on every screen the menu can show.
  it.each(SCREENS)('offers Back in the top right of %s', screen => {
    show(screen)

    const row = $('.panel-user-row')!
    expect(row.contains(back()!), 'Back is not in the top row').toBe(true)
    expect(row.lastElementChild).toBe(back())
  })

  it.each(PANELS)('returns to the menu from %s', panel => {
    show(panel)
    click(back())

    expect(nav('Settings')).toBeDefined()
    expect(isOpen()).toBe(true)
  })

  // One step further out. With the scrim inert this is the only way back to the
  // phrases that does not need a keyboard.
  it('closes the menu from the menu itself', () => {
    show('Menu')
    expect(isOpen()).toBe(true)

    click(back())

    expect(isOpen()).toBe(false)
  })

  it('answers a dwell, a tap and a key like every other control', () => {
    show('Settings')

    expect(back()?.getAttribute('role')).toBe('button')
    expect(back()?.getAttribute('tabindex')).toBe('0')

    fireEvent.pointerEnter(back()!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(nav('Settings'), 'a dwell did not go back').toBeDefined()

    click(nav('Settings'))
    fireEvent.keyDown(back()!, { key: 'Enter' })
    settle()
    expect(nav('Settings'), 'a key did not go back').toBeDefined()
  })
})

describe('the scrim behind the menu', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const isOpen = () => $('.top-panel.open') !== null

  // Moving across the scrim used to close the panel after 600ms, so a pointer
  // wandering on its way to the menu took the menu away again — and a gaze user
  // has no way to move without pointing at something.
  it('stays open however long the pointer rests on it', () => {
    renderApp()
    openMenu()

    const scrim = $('.panel-scrim')!
    fireEvent.pointerMove(scrim)
    act(() => void vi.advanceTimersByTime(5000))
    settle()

    expect(isOpen()).toBe(true)
  })

  it('stays open when the scrim is clicked', () => {
    renderApp()
    openMenu()

    click($('.panel-scrim'))

    expect(isOpen()).toBe(true)
  })

  // It is still in the way on purpose: a phrase behind it must not answer to a
  // dwell that lands on it. jsdom applies no stylesheet, so the rule itself is
  // what there is to check.
  it('keeps the phrases underneath from being reached', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const open = css.slice(css.indexOf('.panel-scrim.open {'))
    expect(open.slice(0, open.indexOf('}'))).toMatch(/pointer-events:\s*auto/)
  })

  // Escape is neither a click nor a dwell, and anyone at a keyboard expects it.
  it('still closes on Escape', () => {
    renderApp()
    openMenu()

    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(isOpen()).toBe(false)
  })
})

describe('sent messages', () => {
  const SENT_KEY = 'peri_sent'
  const tabs = () => $$('.filter-tab[role="tab"]')
  const tabNamed = (name: string) => tabs().find(el => el.textContent === name)
  // The filter bar hides while a typed word is narrowing the grid, and a phrase
  // just inserted leaves the caret in one — so empty the box before looking.
  const sentTexts = () => {
    clearMessage()
    click(tabNamed('Sent'))
    return cells().map(c => c.textContent)
  }
  const iconBtn = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
  const stored = () => JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]').map((m: { text: string }) => m.text)

  it('puts Sent to the left of All, always', () => {
    renderApp()
    expect(tabs().map(el => el.textContent).slice(0, 2)).toEqual(['Sent', 'All'])
  })

  it('says so rather than showing a blank panel before anything is said', () => {
    renderApp()
    click(tabNamed('Sent'))
    expect(cells()).toHaveLength(0)
    expect($('.grid-empty')?.textContent).toMatch(/nothing said yet/i)
  })

  it('keeps a message that was spoken', () => {
    renderApp()
    click(plainCell())
    const said = message()
    click(iconBtn('Speak'))

    expect(spoken).toEqual([said])
    expect(sentTexts()).toEqual([said])
  })

  // Recorded once the clipboard confirms it took it, so a copy that failed is
  // not filed as something that was said.
  it('keeps a message that was copied out', async () => {
    renderApp()
    click(plainCell())
    const said = message()
    click(iconBtn('Copy to clipboard'))
    await act(async () => {
      await Promise.resolve()
    })
    settle()

    expect(sentTexts()).toEqual([said])
  })

  it('keeps nothing when the clipboard refuses', async () => {
    renderApp()
    ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    click(plainCell())
    click(iconBtn('Copy to clipboard'))
    await act(async () => {
      await Promise.resolve()
    })
    settle()

    expect(stored()).toEqual([])
  })

  // In auto-speak the phrase never reaches the box — it is spoken on the spot,
  // so that is the moment it counts as said.
  it('keeps each phrase spoken in auto-speak', () => {
    renderApp({ autoSpeak: true })
    const [first, second] = cells().filter(c => !c.querySelector('.phrase-slot')).slice(0, 2)
    const texts = [first.textContent!, second.textContent!]
    click(first)
    click(second)

    expect(sentTexts()).toEqual([texts[1], texts[0]])
  })

  it('keeps nothing for an empty message', () => {
    renderApp()
    click(iconBtn('Speak'))
    click(iconBtn('Copy to clipboard'))
    expect(stored()).toEqual([])
  })

  // The list is for reaching a sentence again. Ten copies of "yes please" makes
  // that harder, not easier.
  it('moves a repeat to the top rather than listing it twice', () => {
    renderApp({ autoSpeak: true })
    const [first, second] = cells().filter(c => !c.querySelector('.phrase-slot')).slice(0, 2)
    const texts = [first.textContent!, second.textContent!]
    click(first)
    click(second)
    click(first)

    expect(sentTexts()).toEqual([texts[0], texts[1]])
  })

  it('says a kept message again in one dwell', () => {
    renderApp()
    click(plainCell())
    const said = message()
    click(iconBtn('Speak'))
    clearMessage()
    clearMessage()

    click(tabNamed('Sent'))
    click(cells()[0])

    expect(message()).toBe(said)
  })

  it('survives a reload', () => {
    renderApp()
    click(plainCell())
    const said = message()
    click(iconBtn('Speak'))

    cleanup()
    renderApp()
    expect(sentTexts()).toEqual([said])
  })

  describe('in edit mode', () => {
    const enterEditMode = () => click(editToggle())
    const action = (label: string) => $$('.edit-action-btn').find(b => b.textContent?.includes(label))
    const sendOne = () => {
      click(plainCell())
      const said = message()
      click(iconBtn('Speak'))
      clearMessage()
      clearMessage()
      return said
    }

    // A sent message is a record, not a phrase. There is nothing in it to edit —
    // only to keep, or to forget.
    it('offers keeping it rather than editing it', () => {
      renderApp()
      const said = sendOne()
      click(tabNamed('Sent'))
      enterEditMode()
      click(cells()[0])

      expect($('.edit-modal-title')?.textContent).toMatch(/keep this message/i)
      expect(action('Keep')).toBeDefined()
      expect(action('Forget')).toBeDefined()
      // It must not offer to file it under "Sent", which is not a real category.
      expect($<HTMLSelectElement>('.edit-modal-select')?.value).not.toBe('Sent')
      expect(said).not.toBe('')
    })

    it('keeps it as a phrase of its own, leaving the record alone', () => {
      renderApp()
      const said = sendOne()
      click(tabNamed('Sent'))
      enterEditMode()
      click(cells()[0])
      click(action('Keep'))

      const custom = JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2')!).custom
      expect(custom.map((c: { text: string }) => c.text)).toEqual([said])
      expect(stored()).toEqual([said])
    })

    // Somebody who has just said something private needs a way to take it off
    // the screen, and this is the only one.
    it('forgets it', () => {
      renderApp()
      sendOne()
      click(tabNamed('Sent'))
      enterEditMode()
      click(cells()[0])
      click(action('Forget'))

      expect(stored()).toEqual([])
      expect(cells()).toHaveLength(0)
    })
  })
})

describe('the emergency bar with a linked account', () => {
  // The one place the better voice is refused. A request going out and coming
  // back is not what "I can't breathe" needs, and with the network down it is
  // nothing at all — so these phrases never leave the device, whatever is
  // selected. Testing it here rather than against speak() alone: the option has
  // to actually be passed, and the bar is the only caller that passes it.
  it('speaks on the device however good the chosen voice is', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderApp({ voiceURI: 'elevenlabs:v1' })

    click($('.emergency-btn'))

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  // The grid does use it, or linking an account would have bought nothing.
  it('while the grid speaks with the account voice', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
    vi.stubGlobal('fetch', fetcher)
    renderApp({ voiceURI: 'elevenlabs:v1', autoSpeak: true })

    click(plainCell())

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(spoken).toEqual([])
  })
})

describe('rendering only part of a long grid', () => {
  // jsdom lays nothing out, so the grid renders every cell in every other test
  // here — the documented fallback, and why the windowing needs a viewport
  // supplied before it does anything at all.
  //
  // These work inside one category rather than the whole table. It is the same
  // mechanism either way, and mounting two and a half thousand cells eight more
  // times costs the build machine more memory than the coverage is worth.
  const CATEGORY = 'Texting'
  const tabNamed = (name: string) => $$('.filter-tab[role="tab"]').find(el => el.textContent === name)
  const rendered = () => cells().length

  afterEach(() => {
    // On the prototype, so without this every element in every test after this
    // block reports a height it does not have.
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight')
  })

  const setGeometry = (el: Element, props: Record<string, number>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, configurable: true })
  }

  /** Supplies the layout jsdom will not, then lets the grid notice it. */
  const layOut = ({ columns = 5, rowHeight = 72, clientHeight = 200 } = {}) => {
    const wrapper = $('.grid-wrapper')!
    const grid = $('.phrase-grid')!
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      el => ({ gridTemplateColumns: el === grid ? '1fr '.repeat(columns).trim() : '' }) as CSSStyleDeclaration,
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { value: rowHeight, configurable: true })
    setGeometry(wrapper, { clientHeight, scrollHeight: clientHeight * 8, scrollTop: 0 })
    act(() => void fireEvent.scroll(wrapper))
    settle()
  }

  const openCategory = (options?: Parameters<typeof layOut>[0]) => {
    renderApp()
    click(tabNamed(CATEGORY))
    const total = rendered()
    layOut(options)
    return total
  }

  it('renders every cell when there is nothing to measure', () => {
    renderApp()
    expect(rendered()).toBeGreaterThan(2000)
  })

  it('renders a few screens of them once there is', () => {
    const total = openCategory()
    expect(total).toBeGreaterThan(200)
    // 200px of viewport at 72px rows is 3 rows; four screens of those, 5 across.
    expect(rendered()).toBe(60)
  })

  // Columns come from the grid's own computed style rather than a copy of the
  // breakpoints, so a narrow screen windows to a narrow grid.
  it('takes the column count from the grid itself', () => {
    openCategory({ columns: 3 })
    expect(rendered()).toBe(36)
  })

  // However far off the measurement is, the grid keeps adding until it is
  // scrollable — so no phrase can end up out of reach.
  it('keeps adding while the cells do not fill the screen', () => {
    renderApp()
    click(tabNamed(CATEGORY))
    layOut({ columns: 1, rowHeight: 4000, clientHeight: 100 })
    setGeometry($('.grid-wrapper')!, { clientHeight: 800, scrollHeight: 100 })
    act(() => void fireEvent.scroll($('.grid-wrapper')!))
    settle()

    expect(rendered()).toBeGreaterThan(1)
  })

  it('adds more when the end comes into view', () => {
    openCategory()
    const first = rendered()

    setGeometry($('.grid-wrapper')!, { scrollTop: 1400, clientHeight: 200, scrollHeight: 1600 })
    act(() => void fireEvent.scroll($('.grid-wrapper')!))
    settle()

    expect(rendered()).toBeGreaterThan(first)
  })

  // The rail's bottom jump would otherwise land on whatever happened to be
  // rendered rather than on the end of the list.
  it('renders the rest before jumping to the bottom', () => {
    const total = openCategory()
    expect(rendered()).toBeLessThan(total)

    click($$('.scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll to bottom'))

    expect(rendered()).toBe(total)
  })

  // Without this the window stays as wide as it grew, and coming back to a long
  // list after scrolling to the end of it renders the whole thing again.
  it('narrows again when a long list comes back', () => {
    const total = openCategory()
    click($$('.scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll to bottom'))
    expect(rendered()).toBe(total)

    click(tabNamed('Food'))
    click(tabNamed(CATEGORY))

    expect(rendered()).toBe(60)
  })

  it('starts again from the top when the list changes', () => {
    openCategory()
    click($$('.scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll to bottom'))

    fireEvent.change($('.text-display')!, { target: { value: 'help' } })
    settle()

    expect(rendered()).toBeLessThan(60)
  })
})

describe('starting from the last choice made', () => {
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const action = (label: string) => $$('.edit-action-btn').find(b => b.textContent?.includes(label))
  const enterEditMode = () => click(editToggle())
  const categorySelect = () => $<HTMLSelectElement>('#edit-category')
  const voiceTrigger = () => $('.voice-trigger')
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }
  const openAdd = () => click($('.text-display'))
  /** A category that is not the one the editor opens on. */
  const someOtherCategory = () => {
    openAdd()
    const opening = categorySelect()!.value
    const other = [...categorySelect()!.options]
      .map(o => o.value)
      .find(v => v !== opening && v.trim() !== '')!
    click(action('Cancel'))
    return other
  }
  const addPhrase = (text: string, category?: string) => {
    openAdd()
    fireEvent.change($('.edit-modal-text')!, { target: { value: text } })
    settle()
    if (category) {
      fireEvent.change(categorySelect()!, { target: { value: category } })
      settle()
    }
    click(action('Save'))
  }

  // Filing phrases is done in runs. Starting each one from the alphabetically
  // first category means making the same choice over and over.
  it('files the next new phrase where the last one went', () => {
    renderApp()
    enterEditMode()

    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)
    openAdd()

    expect(categorySelect()!.value).toBe(elsewhere)
  })

  it('remembers it across a reload', () => {
    renderApp()
    enterEditMode()
    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)

    cleanup()
    renderApp()
    enterEditMode()
    openAdd()

    expect(categorySelect()!.value).toBe(elsewhere)
  })

  // Opening a phrase to fix a typo must not quietly refile it or change how it
  // sounds, so a phrase that already has either shows its own.
  it('leaves an existing phrase showing its own category', () => {
    renderApp()
    enterEditMode()
    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)

    const other = cells().find(c => c.textContent !== 'One for over there')!
    const ownCategory = () => {
      click(other)
      const value = categorySelect()!.value
      click(action('Cancel'))
      return value
    }
    expect(ownCategory()).not.toBe(elsewhere)
  })

  // A category can be renamed or emptied away between one phrase and the next,
  // and a select whose value is not among its options shows nothing at all.
  it('ignores a remembered category that no longer exists', () => {
    localStorage.setItem('peri_recent', JSON.stringify({ category: 'Somewhere Deleted' }))
    renderApp()
    enterEditMode()
    openAdd()

    const options = [...categorySelect()!.options].map(o => o.value)
    expect(options).not.toContain('Somewhere Deleted')
    expect(categorySelect()!.value, 'the editor opened on nothing').not.toBe('')
    expect(options).toContain(categorySelect()!.value)
  })

  it('starts a new phrase from the last voice, and an existing one from its own', async () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['a']) })))
    renderApp()
    enterEditMode()

    // Give one phrase a voice.
    click($('.text-display'))
    fireEvent.change($('.edit-modal-text')!, { target: { value: 'In her voice' } })
    settle()
    click(voiceTrigger())
    click(inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').startsWith('Rachel')))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Done'))
    click(action('Save'))
    await flush()

    // The next new one starts there.
    click($('.text-display'))
    expect(voiceTrigger()?.textContent).toContain('Rachel')
    click(action('Cancel'))

    // A phrase that has none of its own still shows none.
    click(cells().find(c => c.textContent !== 'In her voice')!)
    expect(voiceTrigger()?.textContent).toContain('Same as everything else')
  })

  // Unlinking takes the voice with it; seeding the next phrase with one that no
  // longer exists would be worse than seeding it with nothing.
  it('forgets a remembered voice when its account goes', async () => {
    localStorage.setItem('peri_recent', JSON.stringify({ voice: 'elevenlabs:v1' }))
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    renderApp()
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Unlink'))
    settle()

    expect(JSON.parse(localStorage.getItem('peri_recent')!).voice).toBeUndefined()
  })
})

describe('giving a phrase its own voice', () => {
  const LINKED = { apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel', collection: 'premade' }] }
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const action = (label: string) => $$('.edit-action-btn').find(b => b.textContent?.includes(label))
  const voiceTrigger = () => $('.voice-trigger')
  /**
   * The same grid Settings uses. Choosing previews the voice, so what it spoke
   * is cleared afterwards — the tests below are about what saying the *phrase*
   * does, not about the preview.
   */
  const chooseVoice = async (name: string) => {
    click(voiceTrigger())
    click(inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').startsWith(name)))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Done'))
    await flush()
    played.length = 0
    spoken.length = 0
  }
  const enterEditMode = () => click(editToggle())
  const stored = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}').voiceOverrides ?? {}

  const linkAccount = () => localStorage.setItem('peri_elevenlabs', JSON.stringify(LINKED))
  const audioReplies = () =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) })))
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  it('offers a voice on the phrase editor, defaulting to none', () => {
    linkAccount()
    renderApp()
    enterEditMode()
    click(plainCell())

    expect(voiceTrigger()?.textContent).toContain('Same as everything else')

    click(voiceTrigger())
    expect(inDoc('.picker-tile').map(el => el.getAttribute('aria-label'))).toContain('Rachel · ElevenLabs')
  })

  // Reopening has to show what the phrase already carries, or there is no way
  // to tell what it is set to without changing it.
  it('shows the phrase its own voice when the editor is reopened', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    const cell = plainCell()
    click(cell)
    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    click(cell)
    expect(voiceTrigger()?.textContent).toContain('Rachel')
  })

  it('remembers the voice against that phrase alone', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)

    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    const overrides = stored()
    expect(Object.values(overrides)).toEqual(['elevenlabs:v1'])
    expect(text).not.toBe('')
  })

  // The whole reason the voice is assigned rather than merely recorded: it is
  // fetched there and then, so saying it later costs no wait.
  it('fetches the audio the moment the voice is assigned', async () => {
    linkAccount()
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
    vi.stubGlobal('fetch', fetcher)
    renderApp()
    enterEditMode()
    click(plainCell())

    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain('/text-to-speech/v1')
  })

  it('speaks the phrase in its own voice rather than the chosen one', async () => {
    linkAccount()
    audioReplies()
    renderApp({ autoSpeak: true })

    enterEditMode()
    const cell = plainCell()
    click(cell)
    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    click(editToggle()) // leave edit mode
    click(plainCell())
    await flush()

    expect(played).toHaveLength(1)
    expect(spoken).toEqual([])
  })

  // The point of the whole arrangement. Assigning fetches the audio, so by the
  // time the bar is pressed it is already here and there is nothing to wait for.
  // Tested from the button rather than from speak(): the option has to actually
  // be passed, and the bar is the only caller that passes it.
  it('keeps its voice on the emergency bar', async () => {
    linkAccount()
    audioReplies()
    renderApp()

    enterEditMode()
    click($('.emergency-btn'))
    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()
    click(editToggle()) // leave edit mode

    // Nothing may be asked for at this point: the bar never waits.
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    click($('.emergency-btn'))
    await flush()

    expect(played, 'the emergency phrase did not use its own voice').toHaveLength(1)
    expect(spoken).toEqual([])
    expect(fetcher, 'the emergency bar went to the network').not.toHaveBeenCalled()
  })

  // A phrase carrying markdown is fetched and stored under the words it speaks,
  // because those are the words that will be asked for when it is spoken. Keyed
  // by the marked-up text instead, the clip is stored once and never found
  // again — and the emergency bar, which never waits, quietly drops back to the
  // device voice for a phrase somebody deliberately gave another.
  //
  // The wording is changed *after* the voice is chosen, and that ordering is the
  // whole test. Choosing a voice previews the phrase, and the preview goes
  // through `speak`, which strips — so a test that picks a voice and saves
  // without touching the text passes whether or not `warmVoice` strips at all.
  // Only the text that changed afterwards reaches the network through
  // `warmVoice` alone.
  it('stores a marked-up phrase under the words it speaks, not its markup', async () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ custom: [{ id: 'custom-md-em', text: 'Stop now', category: 'Emergency' }] }),
    )
    linkAccount()
    audioReplies()
    renderApp()
    const button = (text: string) => $$('.emergency-btn').find(b => b.textContent === text)

    enterEditMode()
    click(button('Stop now'))
    await chooseVoice('Rachel')
    fireEvent.change($('.edit-modal-text')!, { target: { value: '**Stop** right now' } })
    settle()
    click(action('Save'))
    await flush()
    click(editToggle()) // leave edit mode

    // Nothing may be asked for now: it was fetched when the phrase was saved.
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    click(button('Stop right now'))
    await flush()

    expect(played, 'the marked-up phrase did not use its own voice').toHaveLength(1)
    expect(spoken).toEqual([])
    expect(fetcher, 'it went back to the network for a clip already in hand').not.toHaveBeenCalled()
  })

  // The editor hands back what a phrase was *written* as, brackets and all, so
  // the warm-up has to compose it first. Fetched raw, the clip is stored under
  // text nothing ever asks for again — and the phrase quietly falls back to the
  // device voice, having been paid for twice.
  it('fetches what a phrase with choices reads as, not its brackets', async () => {
    linkAccount()
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['a']) }))
    vi.stubGlobal('fetch', fetcher)
    renderApp()

    enterEditMode()
    click(slotCell())
    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    // The text field of each request, not the whole body — the JSON wrapper has
    // braces of its own, and matching those would fail whatever was sent.
    const said = (fetcher.mock.calls as unknown as [string, { body?: string }?][]).map(
      call => JSON.parse(String(call[1]?.body ?? '{}')).text as string,
    )
    expect(said.length, 'nothing was fetched at all').toBeGreaterThan(0)
    for (const text of said) {
      expect(text, 'the placeholder syntax was sent to be read aloud').not.toMatch(/[{}[\]]/)
    }
  })

  // The safety rule survives the change: a phrase whose audio is not in hand is
  // said by the device now rather than in the right voice in a second.
  it('falls straight back to the device when its audio is not in hand', async () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ voiceOverrides: { 'em-0': 'elevenlabs:v1' } }),
    )
    linkAccount()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    renderApp()

    click($('.emergency-btn'))
    await flush()

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('carries the voice into a backup and back out again', async () => {
    linkAccount()
    audioReplies()
    renderApp()
    enterEditMode()
    click(plainCell())
    await chooseVoice('Rachel')
    click(action('Save'))
    await flush()

    click(editToggle())
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Save a file'))

    const result = parseBackup(downloads[downloads.length - 1].text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const carried = [...result.backup.added, ...result.backup.edited].some(e => e.voice === 'elevenlabs:v1')
      expect(carried, 'the voice did not travel with the backup').toBe(true)
    }
  })
})

describe('signing out', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const confirm = () => inDoc('.confirm-modal')[0] ?? null
  const action = (label: string) => inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  const signedIn = () => localStorage.getItem('dwellspeak_user') !== null
  const start = () => {
    renderApp()
    openMenu()
    click(nav('Sign out'))
  }

  // One dwell away from every other thing in the menu, and the one that empties
  // the screen.
  it('asks before it does anything', () => {
    start()

    expect(confirm()).not.toBeNull()
    expect(signedIn()).toBe(true)
    expect($('.app')).not.toBeNull()
  })

  // Somebody whose board is how they speak has every reason to think a button
  // called Sign out might take it away.
  it('says what it will not do', () => {
    start()
    expect(confirm()?.textContent).toMatch(/stay on this device/i)
  })

  it('signs out when confirmed', () => {
    start()
    click(action('Sign out'))

    expect(signedIn()).toBe(false)
    expect($('.signin-page')).not.toBeNull()
  })

  it('stays put when declined', () => {
    start()
    click(action('Stay signed in'))

    expect(confirm()).toBeNull()
    expect(signedIn()).toBe(true)
    expect($('.app')).not.toBeNull()
  })

  it('stays put on Escape', () => {
    start()
    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(confirm()).toBeNull()
    expect(signedIn()).toBe(true)
  })

  // A pointer rests where it last fired. If the confirmation appeared inside the
  // panel, under the nav item that opened it, the pointer already sitting there
  // would answer it.
  it('puts the confirmation outside the menu panel', () => {
    start()
    const scrim = inDoc('.confirm-scrim')[0]
    expect(scrim).toBeDefined()
    expect($('.top-panel')!.contains(scrim)).toBe(false)
    expect(scrim.parentElement).toBe(document.body)
  })

  it('leaves the phrases and settings alone either way', () => {
    renderApp()
    click(plainCell())
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak'))
    clearMessage()
    const store = localStorage.getItem('peri_sent')

    openMenu()
    click(nav('Sign out'))
    click(action('Sign out'))

    expect(signedIn()).toBe(false)
    expect(localStorage.getItem('peri_sent')).toBe(store)
  })
})

describe('reaching all of a panel that has grown', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)
  const arrows = () => $$('.pane-scroll-btn').map(b => b.getAttribute('aria-label'))

  /** jsdom lays nothing out, so the overflow the arrows react to is supplied. */
  const overflow = (pane: Element) => {
    for (const [k, v] of Object.entries({ scrollTop: 200, clientHeight: 400, scrollHeight: 1200 })) {
      Object.defineProperty(pane, k, { value: v, configurable: true })
    }
    fireEvent.scroll(pane)
    settle()
  }

  // My details grows with every contact added, and Settings with the linked
  // account row. A panel taller than the screen is a panel whose bottom half a
  // dwell user cannot reach — there is no wheel and no scrollbar.
  it.each(['My details', 'Settings'])('scrolls %s once there is more than fits', panel => {
    renderApp()
    openMenu()
    click(nav(panel))

    const pane = $('.settings-body')
    expect(pane, `${panel} has no scrolling pane`).not.toBeNull()
    expect(arrows()).toEqual([])

    overflow(pane!)
    expect(arrows()).toEqual(['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom'])
  })

  it('scrolls the panel when an arrow is dwelled', () => {
    renderApp()
    openMenu()
    click(nav('My details'))

    const pane = $('.settings-body')!
    overflow(pane)
    const scrollBy = vi.fn()
    pane.scrollBy = scrollBy

    click($$('.pane-scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll down'))
    expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' })
  })
})

describe('the menu panels on a wide screen', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)

  // The panel spans the whole viewport. Without a column, a setting's label sits
  // at one edge of a wide monitor and its control at the other, and the guide's
  // lines run a couple of hundred characters. All four hold the same measure so
  // they line up as you move between them.
  it.each([
    ['Settings', '.settings-body'],
    ['My details', '.settings-body'],
    ['Backup & sharing', '.backup-body'],
    ['Help', '.help-measure'],
  ])('keeps %s in a reading column', (panel, selector) => {
    renderApp()
    openMenu()
    click(nav(panel))

    const measure = $(selector)
    expect(measure, `${panel} has no column`).not.toBeNull()
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const rule = css.slice(css.indexOf(`${selector} {`))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/max-width:\s*68ch/)
  })
})

describe('the texting category', () => {
  const tabs = () => $$('.filter-tab[role="tab"]')
  const tabNamed = (name: string) => tabs().find(el => el.textContent === name)

  it('has a tab of its own', () => {
    renderApp()
    expect(tabNamed('Texting')).toBeDefined()
  })

  it('fills the grid with expansions rather than acronyms', () => {
    renderApp()
    click(tabNamed('Texting'))

    const texts = cells().map(c => c.textContent)
    expect(texts.length).toBeGreaterThanOrEqual(200)
    expect(texts).toContain('Be right back')
    expect(texts).toContain('Talk to you later')
    // Spoken aloud, "B R B" is not a sentence.
    expect(texts).not.toContain('BRB')
  })

  // Adults swear, and an AAC board that cannot is a board that puts its user in
  // a register they did not choose. The word is cut to its first letter, which
  // is also the letter its acronym uses.
  it('carries the profane ones cut to a letter', () => {
    renderApp()
    click(tabNamed('Texting'))

    fireEvent.change($('.text-display')!, { target: { value: 'wtf' } })
    settle()

    expect(cells().map(c => c.textContent)).toContain('What the f')
  })

  // Typing the acronym narrows the grid to it, which is what makes a category
  // this size usable at all.
  it('narrows to a phrase when its acronym is typed', () => {
    renderApp()
    click(tabNamed('Texting'))

    fireEvent.change($('.text-display')!, { target: { value: 'ttyl' } })
    settle()

    expect(cells().map(c => c.textContent)).toContain('Talk to you later')
    expect(cells().length).toBeLessThan(20)
  })
})

describe('choosing a voice', () => {
  // The picker is portalled to the body, so it is not under the render
  // container the rest of these tests query.
  const inDocument = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const trigger = () => $('.voice-trigger')
  const modal = () => inDocument('.picker-modal')[0] ?? null
  const tiles = () => inDocument('.picker-tile')
  const tileNamed = (name: string) => tiles().find(el => el.getAttribute('aria-label')?.startsWith(name))
  const storedVoice = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}').voiceURI

  /** Seeded before mounting: the stub never fires `voiceschanged`. */
  const openSettings = (...names: string[]) => {
    voices.length = 0
    voices.push(...names.map(name => ({ voiceURI: `uri-${name}`, name, lang: 'en-GB' }) as SpeechSynthesisVoice))
    renderApp()
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const openPicker = (...names: string[]) => {
    openSettings(...names)
    click(trigger())
  }

  it('shows the chosen voice in settings without a list beside it', () => {
    openSettings('Daniel')
    expect(trigger()?.textContent).toContain('Default')
    expect(modal()).toBeNull()
  })

  // Sixty device voices in a 186px dropdown was the one list in this app a gaze
  // user could not realistically work through.
  it('opens a full-screen grid, not a dropdown', () => {
    openPicker('Daniel', 'Karen', 'Moira')

    expect(modal()).not.toBeNull()
    expect(inDocument('.picker-grid')).toHaveLength(1)
    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual([
      'Default',
      'Daniel · en-GB',
      'Karen · en-GB',
      'Moira · en-GB',
    ])
  })

  // Somebody who went to the trouble of linking an account is looking for those
  // voices, not scrolling past sixty the device came with.
  it('puts the account voices first', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    openPicker('Daniel', 'Karen')

    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual([
      'Default',
      'Rachel · ElevenLabs',
      'Daniel · en-GB',
      'Karen · en-GB',
    ])
  })

  // Sixty device voices and an account's worth on top is more than a grid can
  // usefully show at once.
  it('offers a chip per collection and per language, and narrows to it', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({
        apiKey: 'sk-test',
        voices: [
          { id: 'v1', name: 'Rachel', collection: 'premade' },
          { id: 'v2', name: 'Me', collection: 'cloned' },
        ],
      }),
    )
    openPicker('Daniel', 'Karen')

    const chips = inDocument('.picker-filter').map(c => c.textContent)
    expect(chips[0]).toMatch(/^All/)
    expect(chips.some(c => c?.startsWith('Premade'))).toBe(true)
    expect(chips.some(c => c?.startsWith('Cloned'))).toBe(true)
    expect(chips.some(c => /english/i.test(c ?? ''))).toBe(true)

    click(inDocument('.picker-filter').find(c => c?.textContent?.startsWith('Cloned')))
    expect(tiles().map(el => el.getAttribute('aria-label'))).toEqual(['Me · ElevenLabs'])

    click(inDocument('.picker-filter').find(c => c?.textContent?.startsWith('All')))
    expect(tiles().length).toBeGreaterThan(1)
  })

  // The chips outgrow the screen as soon as an account has a few collections,
  // and a row with no arrows is a row whose far end does not exist for anybody
  // without a wheel.
  it('scrolls the chip row once it is wider than the screen', () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({
        apiKey: 'sk-test',
        voices: [
          { id: 'v1', name: 'Rachel', collection: 'premade' },
          { id: 'v2', name: 'Me', collection: 'cloned' },
        ],
      }),
    )
    openPicker('Daniel', 'Karen')
    const row = inDocument('.scroll-row-inner')[0]
    const arrows = () => inDocument('.scroll-row .pane-scroll-btn').map(b => b.getAttribute('aria-label'))

    expect(arrows(), 'arrows with nowhere to go').toEqual([])

    // jsdom lays nothing out, so the overflow they react to is supplied.
    const setWidths = (scrollLeft: number, clientWidth: number, scrollWidth: number) => {
      for (const [k, v] of Object.entries({ scrollLeft, clientWidth, scrollWidth })) {
        Object.defineProperty(row, k, { value: v, configurable: true })
      }
      fireEvent.scroll(row)
      settle()
    }

    setWidths(0, 300, 900)
    expect(arrows()).toEqual(['Scroll right'])

    setWidths(300, 300, 900)
    expect(arrows()).toEqual(['Scroll left', 'Scroll right'])

    setWidths(600, 300, 900)
    expect(arrows()).toEqual(['Scroll left'])

    const scrollBy = vi.fn()
    row.scrollBy = scrollBy
    click(inDocument('.scroll-row .pane-scroll-btn')[0])
    expect(scrollBy).toHaveBeenCalledWith({ left: -160, behavior: 'smooth' })
  })

  it('offers no chips when there is only one group to choose from', () => {
    openPicker('Daniel', 'Karen')
    expect(inDocument('.picker-filter')).toHaveLength(0)
  })

  it('marks the one in use', () => {
    openPicker('Daniel')
    expect(tileNamed('Default')?.getAttribute('aria-selected')).toBe('true')
    expect(tileNamed('Daniel')?.getAttribute('aria-selected')).toBe('false')
  })

  const action = (label: string) => inDocument('.panel-btn').find(b => b.getAttribute('aria-label') === label)

  // Nobody can tell sixty voices apart by name, and a preview button beside
  // each would put two targets in every tile — the worst thing to give someone
  // aiming by gaze. The tile is the preview.
  it('speaks a sample in the voice just chosen', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))

    expect(spoken).toHaveLength(1)
    expect(lastUtterance?.voice?.name).toBe('Karen')
  })

  it('stays open so the next one can be tried', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    expect(modal()).not.toBeNull()

    click(tileNamed('Daniel'))
    expect(spoken).toHaveLength(2)
    expect(lastUtterance?.voice?.name).toBe('Daniel')
  })

  it('previews at the volume and speed the app is set to', () => {
    voices.length = 0
    voices.push({ voiceURI: 'uri-Karen', name: 'Karen', lang: 'en-GB' } as SpeechSynthesisVoice)
    renderApp({ volume: 0.4, rate: 1.8 })
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    click(trigger())
    click(tileNamed('Karen'))

    expect(lastUtterance).toMatchObject({ volume: 0.4, rate: 1.8 })
  })

  it('keeps the last one tried when Done', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(action('Done'))

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('uri-Karen')
    expect(trigger()?.textContent).toContain('Karen')
  })

  // Trying voices has to be free, or the preview is a trap.
  it('puts back the voice it started with when cancelled', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(tileNamed('Daniel'))
    click(action('Cancel'))

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('')
    expect(trigger()?.textContent).toContain('Default')
  })

  it('puts it back on Escape too', () => {
    openPicker('Daniel')
    click(tileNamed('Daniel'))
    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    expect(modal()).toBeNull()
    expect(storedVoice()).toBe('')
  })

  // Reopening after keeping one must not offer to revert to something older.
  it('starts each visit from the voice in use', () => {
    openPicker('Daniel', 'Karen')
    click(tileNamed('Karen'))
    click(action('Done'))

    click(trigger())
    click(tileNamed('Daniel'))
    click(action('Cancel'))

    expect(storedVoice()).toBe('uri-Karen')
  })

  // The menu panel is animated with `transform`, and a transformed ancestor
  // makes `position: fixed` resolve against that ancestor rather than the
  // viewport — which had the picker coming out a few hundred pixels wide,
  // squeezed inside the menu. jsdom lays nothing out, so the only part of that
  // a test can see is where the picker sits in the tree.
  it('is not inside the panel it opens from', () => {
    openPicker('Daniel')

    const scrim = inDocument('.picker-modal-scrim')[0]
    expect(scrim).toBeDefined()
    expect($('.top-panel')!.contains(scrim), 'the picker is inside the transformed panel').toBe(false)
    expect(scrim.parentElement).toBe(document.body)
  })

  // Sixty voices is the longest list in the app, and 80 pixels at a time is not
  // a way to get through it.
  it('offers all four scroll controls once there is somewhere to go', () => {
    openPicker('Daniel', 'Karen', 'Moira')
    const pane = inDocument('.picker-modal .scroll-pane-inner')[0]
    const controls = () => inDocument('.picker-modal .pane-scroll-btn').map(b => b.getAttribute('aria-label'))

    expect(controls(), 'nothing to scroll yet').toEqual([])

    for (const [prop, value] of Object.entries({ scrollTop: 300, clientHeight: 400, scrollHeight: 1200 })) {
      Object.defineProperty(pane, prop, { value, configurable: true })
    }
    fireEvent.scroll(pane)
    settle()

    expect(controls()).toEqual(['Go to top', 'Scroll up', 'Scroll down', 'Go to bottom'])
  })

  it('takes itself away again when closed', () => {
    openPicker('Daniel')
    click(action('Done'))
    expect(inDocument('.picker-modal-scrim')).toHaveLength(0)
  })

  it('answers a dwell like every other control', () => {
    openSettings('Daniel', 'Karen')

    fireEvent.pointerEnter(trigger()!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(modal()).not.toBeNull()

    fireEvent.pointerEnter(tileNamed('Karen')!)
    act(() => void vi.advanceTimersByTime(800))
    settle()
    expect(storedVoice()).toBe('uri-Karen')
  })
})

describe('linking an ElevenLabs account', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const keyField = () => $<HTMLInputElement>('input[aria-label="ElevenLabs API key"]')
  const btn = (label: string) => $$('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  // Portalled to the body, so not under the render container.
  const voiceOptions = () => {
    click($('.voice-trigger'))
    return [...document.body.querySelectorAll('.picker-tile')].map(o => o.getAttribute('aria-label'))
  }
  const respondWith = (voices: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ voices }) })))
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  it('is offered in settings, unlinked, with the key never on screen', () => {
    renderApp()
    openSettings()

    expect(keyField()).not.toBeNull()
    // A key is a credential; a support call over a shared screen should not
    // leak it, and it is pasted rather than read back.
    expect(keyField()?.type).toBe('password')
    expect(btn('Link')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('adds the account voices to the picker, above the device ones', async () => {
    renderApp()
    openSettings()
    respondWith([{ voice_id: 'v1', name: 'Rachel' }, { voice_id: 'v2', name: 'Adam' }])

    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    expect($('.eleven-status')?.textContent).toMatch(/2 voices/)
    expect(voiceOptions()).toEqual(['Default', 'Rachel · ElevenLabs', 'Adam · ElevenLabs'])
  })

  it('keeps the account across a reload, and the key out of sight', async () => {
    renderApp()
    openSettings()
    respondWith([{ voice_id: 'v1', name: 'Rachel' }])
    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    expect(JSON.parse(localStorage.getItem('peri_elevenlabs')!).apiKey).toBe('sk-test')
    // Not in the phrase store, the profile or the settings — the three things a
    // backup is built from.
    for (const key of ['dwellspeak_phrase_store_v2', 'dwellspeak_profile', 'dwellspeak_settings']) {
      expect(localStorage.getItem(key) ?? '').not.toContain('sk-test')
    }
  })

  it('says what went wrong and links nothing', async () => {
    renderApp()
    openSettings()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))

    fireEvent.change(keyField()!, { target: { value: 'wrong' } })
    settle()
    click(btn('Link'))
    await flush()

    expect($('.eleven-error')?.textContent).toMatch(/not accepted/i)
    expect(localStorage.getItem('peri_elevenlabs')).toBeNull()
    expect(keyField()).not.toBeNull()
  })

  // Unlinking with one of its voices chosen would leave the picker naming a
  // voice that is not there any more.
  it('hands the voice back to the device when unlinked', async () => {
    renderApp()
    openSettings()
    respondWith([{ voice_id: 'v1', name: 'Rachel' }])
    fireEvent.change(keyField()!, { target: { value: 'sk-test' } })
    settle()
    click(btn('Link'))
    await flush()

    click($('.voice-trigger'))
    click([...document.body.querySelectorAll('.picker-tile')].find(o => o.getAttribute('aria-label')?.includes('Rachel')))
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).voiceURI).toBe('elevenlabs:v1')

    click(btn('Unlink'))
    settle()

    expect(localStorage.getItem('peri_elevenlabs')).toBeNull()
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).voiceURI).toBe('')
    expect(keyField()).not.toBeNull()
  })
})

describe('accessibility', () => {
  it('puts every phrase cell in the tab order as a button', () => {
    renderApp()
    const sample = cells().slice(0, 50)
    expect(sample.every(c => c.getAttribute('role') === 'button')).toBe(true)
    expect(sample.every(c => (c as HTMLElement).tabIndex === 0)).toBe(true)
  })

  it('keeps the toolbar reachable', () => {
    renderApp()
    const buttons = $$<HTMLButtonElement>('.icon-btn')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.filter(b => !b.disabled).every(b => b.tabIndex === 0)).toBe(true)
  })

  it('labels the mode toggles with their pressed state', () => {
    renderApp()
    expect(modes().every(t => t.hasAttribute('aria-pressed'))).toBe(true)
  })
})

describe('sign-in providers', () => {
  // Tests run with no VITE_… variables set, so no provider is configured.
  it('offers only guest when nothing is configured', () => {
    container = render(<App />).container
    const labels = $$('.auth-btn').map(b => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Continue as guest'])
  })

  it('hides the divider when there is nothing to divide', () => {
    container = render(<App />).container
    expect($('.signin-divider')).toBeNull()
  })

  it('still lets a guest in', () => {
    container = render(<App />).container
    click($$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest'))
    expect($('.app')).not.toBeNull()
  })
})

describe('legal pages', () => {
  const at = (path: string) => {
    window.history.replaceState({}, '', path)
    container = render(<App />).container
    settle()
  }

  afterEach(() => window.history.replaceState({}, '', '/'))

  it.each([
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
  ])('serves %s as a standalone document', (path, title) => {
    at(path)
    expect($('.legal-page')).not.toBeNull()
    expect($('.legal-title')?.textContent).toBe(title)
    expect($('.legal-updated')?.textContent).toMatch(/last updated/i)
    expect($$('.help-section').length).toBeGreaterThan(4)
  })

  // Google and Meta fetch these URLs, and a visitor may have no account.
  it('renders without an account and without the app around it', () => {
    localStorage.clear()
    at('/privacy')
    expect($('.signin-page')).toBeNull()
    expect($('.app')).toBeNull()
    expect($('.legal-page')).not.toBeNull()
  })

  it('offers a way back to the app', () => {
    at('/terms')
    expect($<HTMLAnchorElement>('.legal-back')?.getAttribute('href')).toBe('/')
  })

  it('leaves other paths on the app', () => {
    at('/')
    expect($('.legal-page')).toBeNull()
  })

  it('links both documents from the sign-in page', () => {
    at('/')
    const hrefs = $$<HTMLAnchorElement>('.signin-legal a').map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['/terms', '/privacy'])
  })
})

// Every settable value carries a revert, and Settings carries one control that
// reverts the lot. The second is the only thing in this app that can take away
// everything somebody wrote, so it asks first — and offers a file before it does.
describe('putting settings back', () => {
  const openSettings = () => {
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Open menu'))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const row = (label: string) =>
    $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === label)!
  const stepBtn = (label: string, within: Element) =>
    [...within.querySelectorAll('.step-btn')].find(b => b.getAttribute('aria-label')?.startsWith(label))!
  const confirmBtn = (label: string) =>
    [...document.body.querySelectorAll('.panel-btn')].find(b => b.textContent?.includes(label))

  describe('one value at a time', () => {
    it('offers a revert on every value, naming what it goes back to', () => {
      renderApp()
      openSettings()
      const labels = $$('.setting-row .step-btn')
        .map(b => b.getAttribute('aria-label'))
        .filter((l): l is string => !!l && l.startsWith('Reset '))
      expect(labels).toEqual([
        'Reset phrase dwell to 1.5s',
        'Reset action dwell to 0.8s',
        'Reset auto-repeat to 1000ms',
        'Reset volume to 100%',
        'Reset speed to 1.0×',
      ])
    })

    it('puts a changed value back and keeps it there', () => {
      renderApp({ phraseDwellMs: 2500 })
      openSettings()
      const dwell = row('Phrase dwell')
      expect(dwell.querySelector<HTMLInputElement>('.setting-number')!.value).toBe('2500')

      click(stepBtn('Reset phrase dwell', dwell))

      expect(dwell.querySelector<HTMLInputElement>('.setting-number')!.value).toBe('1500')
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(1500)
    })

    // Quiet rather than gone: a row that changed width as a value crossed its
    // default would move the two buttons beside it, and a control somebody has
    // learnt to find should be in the same place whether or not it can do anything.
    it('goes quiet at the default rather than away', () => {
      renderApp()
      openSettings()
      const dwell = row('Phrase dwell')
      const revert = stepBtn('Reset phrase dwell', dwell)

      expect(revert.getAttribute('aria-disabled')).toBe('true')
      expect($$('.setting-row .step-btn').length, 'a control went missing').toBe(15)
    })
  })

  describe('all of it at once', () => {
    /** jsdom implements no navigation, so the reload is watched rather than run. */
    const watchReload = () => {
      const reload = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload },
        configurable: true,
        writable: true,
      })
      return reload
    }

    const seedSomething = () => {
      localStorage.setItem('peri_sent', JSON.stringify([{ text: 'said this', at: 1 }]))
      localStorage.setItem('peri_elevenlabs', JSON.stringify({ apiKey: 'k', voices: [] }))
      localStorage.setItem('dwellspeak_profile', JSON.stringify({ contacts: ['Mum'], name: {} }))
    }

    it('asks before it does anything', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))

      expect(document.body.querySelector('.confirm-modal')).not.toBeNull()
      // Nothing has gone yet.
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })

    it('leaves everything alone when cancelled', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Cancel'))

      expect(document.body.querySelector('.confirm-modal')).toBeNull()
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })

    it('clears everything it wrote, and reloads so nothing stale is left showing', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      const reload = watchReload()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Reset everything'))

      for (const key of [
        'dwellspeak_settings',
        'dwellspeak_phrase_store_v2',
        'dwellspeak_profile',
        'peri_elevenlabs',
        'peri_sent',
        'peri_recent',
      ]) {
        expect(localStorage.getItem(key), `${key} survived the reset`).toBeNull()
      }
      expect(reload).toHaveBeenCalled()
    })

    // Signing out is its own item with its own confirmation. Dropping somebody at
    // the sign-in page is not what they asked for when they asked for a reset.
    it('leaves them signed in', () => {
      renderApp()
      watchReload()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Reset everything'))

      expect(localStorage.getItem('dwellspeak_user')).not.toBeNull()
    })

    // Deleting a phrase is the one change with no road back, and this deletes all
    // of them, so a file to keep is the first thing on offer.
    it('offers a backup before wiping, and says it saved one', () => {
      renderApp({ phraseDwellMs: 2500 })
      seedSomething()
      openSettings()
      click(confirmBtn('Reset to Factory Defaults'))
      click(confirmBtn('Export a backup first'))

      expect(downloads.length, 'no file was offered').toBeGreaterThan(0)
      expect(document.body.querySelector('.confirm-ok')?.textContent).toMatch(/^Saved as peri-backup/)
      // Offering is not doing: the device is still whole until they say so.
      expect(localStorage.getItem('peri_sent')).not.toBeNull()
      expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).phraseDwellMs).toBe(2500)
    })
  })
})
