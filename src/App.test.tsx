import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App'
import { BLANK } from './core/phrases'
import { HELP_SECTIONS } from './menu/help'
import { parseBackup } from './core/backup'
import { spoken, lastUtterance, downloads, setClipboardText, voices } from './test/setup'

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
const toggles = () => $$('.toggle-btn')
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
  // into the app.
  it('offers dwell arrows exactly when there is somewhere to go', () => {
    showSignIn()
    expect(arrows()).toEqual([])

    setGeometry(0, 400, 900)
    expect(arrows()).toEqual(['Scroll down'])

    setGeometry(250, 400, 900)
    expect(arrows()).toEqual(['Scroll up', 'Scroll down'])

    setGeometry(500, 400, 900)
    expect(arrows()).toEqual(['Scroll up'])
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

  // On the message box rather than over the phrases, so it costs the grid no
  // height at all.
  it('sits on the message box, taking nothing from the grid', () => {
    renderApp()
    expect($('.topbar > .rest-btn')).not.toBeNull()
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
  it('is off by default, with the toggle above the edit toggle', () => {
    renderApp()
    const [auto, edit] = toggles()
    expect(auto.getAttribute('aria-label')).toMatch(/auto-speak/i)
    expect(edit.getAttribute('aria-label')).toMatch(/edit/i)
    expect(auto.getAttribute('aria-pressed')).toBe('false')
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
    click(toggles()[0])
    expect(toggles()[0].getAttribute('aria-pressed')).toBe('false')

    const cell = plainCell()
    click(cell)
    expect(spoken).toEqual([])
    expect(message()).toBe(cell.textContent)
  })

  it('persists across a reload', () => {
    renderApp()
    click(toggles()[0])
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

describe('edit mode', () => {
  // Regression guard: visiblePhrases omitted mainPhrases from its dependency
  // array, so the grid kept showing the old text until the filter moved.
  it('shows an edited phrase immediately', () => {
    renderApp()
    click(toggles()[1])

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
    click(toggles()[1])
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
    click(toggles()[1])

    const doomed = cells()[0].textContent
    click(cells()[0])
    click($$('.edit-action-btn').find(b => b.textContent?.includes('Delete')))

    expect(cells()[0].textContent).not.toBe(doomed)
  })

  it('toggles independently of auto-speak', () => {
    renderApp()
    click(toggles()[1])
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)
    expect(toggles()[0].getAttribute('aria-pressed')).toBe('false')
  })
})

describe('adding a phrase from the message box', () => {
  const composer = () => $<HTMLTextAreaElement>('.text-display')!
  const modalText = () => $<HTMLTextAreaElement>('.edit-modal-text')?.value
  const enterEditMode = () => click(toggles()[1])
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
    click(toggles()[1]) // leave edit mode

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

describe('focusing the message box by dwell', () => {
  const composer = () => $<HTMLTextAreaElement>('.text-display')!
  const dwell = (el: Element) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(800))
    settle()
  }

  // Placing the caret to type meant clicking the box, which a dwell-only user
  // cannot do — the message was theirs to build but not to correct.
  it('gives it focus after a hold', () => {
    renderApp()
    expect(document.activeElement).not.toBe(composer())
    dwell(composer())
    expect(document.activeElement).toBe(composer())
  })

  it('shows the hold progressing', () => {
    renderApp()
    fireEvent.pointerEnter(composer())
    act(() => void vi.advanceTimersByTime(400))
    expect(composer().classList.contains('dwelling')).toBe(true)
  })

  // A pointer left resting on the box while its owner types should not sit
  // there re-arming and flashing a progress bar at them.
  it('stops arming once the box already holds focus', () => {
    renderApp()
    dwell(composer())
    fireEvent.pointerLeave(composer())

    fireEvent.pointerEnter(composer())
    act(() => void vi.advanceTimersByTime(400))
    expect(composer().classList.contains('dwelling')).toBe(false)
  })

  // The bar is a CSS animation timed off this variable. Without it the
  // animation falls back to a fixed 800ms and drifts away from the real hold
  // for anyone who has changed their dwell time.
  it('paces the bar to the configured dwell time', () => {
    renderApp({ actionDwellMs: 2000 })
    expect(composer().style.getPropertyValue('--dwell-duration')).toBe('2000ms')
  })

  it('arms again once focus has moved away', () => {
    renderApp()
    dwell(composer())
    act(() => void composer().blur())
    fireEvent.pointerLeave(composer())

    fireEvent.pointerEnter(composer())
    act(() => void vi.advanceTimersByTime(400))
    expect(composer().classList.contains('dwelling')).toBe(true)
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

  it('renders every section heading and its body', () => {
    renderApp()
    openMenu()
    click(nav('Help'))

    const headings = $$('.help-section-title').map(h => h.textContent)
    expect(headings).toEqual(HELP_SECTIONS.map(s => s.title))
    expect($$('.help-text').length + $$('.help-list li').length).toBeGreaterThan(20)
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
})

describe('a phrase with a blank', () => {
  // The blank is there to be typed over, and a dwell user cannot place a caret
  // by clicking — so putting it on the blank is the whole of that feature.
  it('lands the caret on the blank, selected, ready to type over', () => {
    renderApp()
    const blankCell = cells().find(c => (c.textContent ?? '').includes(BLANK))!
    click(blankCell)
    settle()

    const box = $<HTMLTextAreaElement>('.text-display')!
    expect(box.value).toContain(BLANK)
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe(BLANK)
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
  const scopeRow = (label: string) => $$('.backup-scope-row').find(r => r.getAttribute('aria-label') === label)
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

    const rows = $$('.backup-scope-row').map(r => r.getAttribute('aria-label'))
    expect(rows[0]).toBe('Everything')
    expect(rows).toContain('Kitchen')
    // The emergency bar has no tab of its own, so nothing else here would let
    // its phrases be exported on their own.
    expect(rows).toContain('Emergency')
    expect(scopeRow('Everything')?.getAttribute('aria-checked')).toBe('true')
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

    click(scopeRow('Kitchen'))
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
    click(scopeRow('Kitchen'))
    const { text: partial } = saved()
    click(scopeRow('Everything'))
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
    const enterEditMode = () => click(toggles()[1])
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
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
    vi.stubGlobal('fetch', fetcher)
    renderApp({ voiceURI: 'elevenlabs:v1', autoSpeak: true })

    click(plainCell())

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(spoken).toEqual([])
  })
})

describe('choosing a voice', () => {
  const trigger = () => $('.voice-trigger')
  const modal = () => $('.voice-modal')
  const tiles = () => $$('.voice-tile')
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
    expect($('.voice-grid')).not.toBeNull()
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

  it('marks the one in use', () => {
    openPicker('Daniel')
    expect(tileNamed('Default')?.getAttribute('aria-selected')).toBe('true')
    expect(tileNamed('Daniel')?.getAttribute('aria-selected')).toBe('false')
  })

  const action = (label: string) => $$('.panel-btn').find(b => b.getAttribute('aria-label') === label)

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

  // The panel it opens from is itself a dialog; a picker underneath it would be
  // unreachable.
  it('sits above the menu panel', () => {
    openPicker('Daniel')
    const scrim = $('.voice-modal-scrim')!
    const panel = $('.top-panel')!
    expect(scrim.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
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
  const voiceOptions = () => {
    click($('.voice-trigger'))
    return $$('.voice-tile').map(o => o.getAttribute('aria-label'))
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
    click($$('.voice-tile').find(o => o.getAttribute('aria-label')?.includes('Rachel')))
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
    expect(toggles().every(t => t.hasAttribute('aria-pressed'))).toBe(true)
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
