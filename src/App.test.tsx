import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from './App'
import { BLANK } from './phrases'
import { HELP_SECTIONS } from './help'
import { spoken, lastUtterance } from './test/setup'

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

  // Outside edit mode the box is for typing. A dwell that opened a modal would
  // fire while the user was mid-message.
  it('does not dwell outside edit mode', () => {
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
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Back'))
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
    expect($('.help-title')?.textContent).toMatch(/dwellspeak/i)
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
    click(nav('Back'))

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
