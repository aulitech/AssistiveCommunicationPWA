// **Getting started**: the guide, a part at a time, opening on signing in — see
// docs/decisions/getting-started.md. Signed in through the sign-in page here,
// since that is what opens it: every other whole-app test opens a board that
// was signed in already.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import App from '../../src/App'
import { HELP_SECTIONS } from '../../src/menu/help'
import { spoken } from '../setup'

let container: HTMLElement
const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const inBody = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))
/** The second the app is deaf for after the screen moves under a resting pointer — which every page here does. */
const pastTheHold = () => act(() => void vi.advanceTimersByTime(1100))

let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: vi.fn() },
    configurable: true,
    writable: true,
  })
})
afterEach(() => vi.useRealTimers())

/** The sign-in page, as a page loaded with nobody signed in. */
function signedOut() {
  cleanup()
  localStorage.removeItem('dwellspeak_user')
  container = render(<App />).container
  settle()
}
function signIn() {
  click($$('.auth-btn').find(b => b.getAttribute('aria-label') === 'Continue as guest'))
  pastTheHold()
}
/** A page opened with somebody signed in already, as a reload leaves it. */
function openedSignedIn() {
  cleanup()
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  container = render(<App />).container
  settle()
}

const intro = () => $('.introduction')
const button = (label: string) => $$('.introduction .panel-btn').find(b => b.getAttribute('aria-label') === label)
const press = (label: string) => {
  click(button(label))
  pastTheHold()
}
const checkbox = () => $('.introduction [role="checkbox"]')!
const outline = () => $$('.outline-row')
const rowFor = (title: string) => outline().find(r => r.querySelector('.outline-title')?.textContent === title)
const partTitle = () => $('.introduction .help-section-title')?.textContent
const stored = () => JSON.parse(localStorage.getItem('peri_introduction') ?? '{}')
const settings = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}')

describe('opening', () => {
  it('opens on signing in, on its first page', () => {
    signedOut()
    signIn()

    expect(intro()).not.toBeNull()
    expect($('.introduction-title')?.textContent).toBe('Getting started')
    expect(checkbox().getAttribute('aria-checked')).toBe('false')
    expect(checkbox().getAttribute('aria-label')).toBe("Don't show this at sign-in")
    expect(button('Start')).toBeDefined()
  })

  // A reload in the middle of a conversation is not somebody arriving.
  it('does not open on a board opened already signed in', () => {
    openedSignedIn()
    expect(intro()).toBeNull()
    expect($('.text-display')).not.toBeNull()
  })

  // It stands where the box, the tabs and the grid are; the bar stays, live.
  it('leaves the emergency bar on screen and speaking', () => {
    signedOut()
    signIn()

    expect($('.text-display')).toBeNull()
    expect($('.phrase-cell')).toBeNull()
    click($('.emergency-btn'))
    expect(spoken).toHaveLength(1)
  })

  it('gives the board back on Close, and on Escape', () => {
    signedOut()
    signIn()
    press('Close')
    expect(intro()).toBeNull()
    expect($('.text-display')).not.toBeNull()

    signedOut()
    signIn()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(intro()).toBeNull()
  })
})

describe('turning it off and on', () => {
  it('stays shut at the next sign-in once the box is ticked', () => {
    signedOut()
    signIn()
    click(checkbox())
    expect(checkbox().getAttribute('aria-checked')).toBe('true')
    expect(settings().introduction).toBe(false)

    signedOut()
    signIn()
    expect(intro()).toBeNull()
  })

  it('is the same setting as the row in Settings, which can also open it now', () => {
    signedOut()
    signIn()
    click(checkbox())
    press('Close')

    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    const row = (label: string) => inBody('.panel-btn').find(b => b.getAttribute('aria-label') === label)
    click(row('Show at sign-in'))
    expect(settings().introduction).toBe(true)
    expect(row("Don't show at sign-in")).toBeDefined()

    click(row('Open it now'))
    pastTheHold()
    expect(intro()).not.toBeNull()
    expect(checkbox().getAttribute('aria-checked')).toBe('false')
  })
})

describe('going through it', () => {
  it('is the guide, a section a part, in the guide’s order', () => {
    signedOut()
    signIn()

    expect(outline().map(r => r.querySelector('.outline-title')?.textContent)).toEqual(
      HELP_SECTIONS.map(s => s.title),
    )
    press('Start')
    expect(partTitle()).toBe(HELP_SECTIONS[0].title)
    const first = HELP_SECTIONS[0].blocks[0]
    expect($('.introduction .help-text')?.textContent).toBe(
      first.kind === 'text' ? first.text.replace(/:[a-z-]+:/g, '') : '',
    )
    expect($('.introduction-progress')?.textContent).toBe(
      `Part 1 of ${HELP_SECTIONS.length} · 0 of ${HELP_SECTIONS.length} covered`,
    )
  })

  it('ticks off a part when somebody moves on from it, and keeps the tick', () => {
    vi.setSystemTime(new Date(2026, 8, 29, 12))
    signedOut()
    signIn()
    press('Start')
    press('Next')

    expect(partTitle()).toBe(HELP_SECTIONS[1].title)
    expect(Object.keys(stored())).toEqual([HELP_SECTIONS[0].title])

    press('Outline')
    expect(rowFor(HELP_SECTIONS[0].title)?.classList.contains('is-covered')).toBe(true)
    expect(rowFor(HELP_SECTIONS[0].title)?.querySelector('.outline-covered')?.textContent).toMatch(/29/)
    expect(rowFor(HELP_SECTIONS[1].title)?.classList.contains('is-covered')).toBe(false)

    // The next sign-in, and the history is still there.
    signedOut()
    signIn()
    expect(rowFor(HELP_SECTIONS[0].title)?.classList.contains('is-covered')).toBe(true)
  })

  // Self-paced: Continue picks up at the first part not yet covered.
  it('continues from the first part not covered', () => {
    localStorage.setItem(
      'peri_introduction',
      JSON.stringify({ [HELP_SECTIONS[0].title]: 1, [HELP_SECTIONS[1].title]: 2 }),
    )
    signedOut()
    signIn()
    press('Continue')
    expect(partTitle()).toBe(HELP_SECTIONS[2].title)
  })

  it('goes to any part from the outline, and back from it', () => {
    signedOut()
    signIn()
    click(rowFor(HELP_SECTIONS[4].title))
    pastTheHold()
    expect(partTitle()).toBe(HELP_SECTIONS[4].title)

    press('Back')
    expect(partTitle()).toBe(HELP_SECTIONS[3].title)
    // Going back covers nothing: only moving on from a part does.
    expect(stored()).toEqual({})
  })

  it('finishes on the outline with every part ticked, and offers to start again', () => {
    const allButLast = Object.fromEntries(HELP_SECTIONS.slice(0, -1).map((s, i) => [s.title, i + 1]))
    localStorage.setItem('peri_introduction', JSON.stringify(allButLast))
    signedOut()
    signIn()
    press('Continue')
    expect(partTitle()).toBe(HELP_SECTIONS.at(-1)!.title)

    press('Finish')

    expect(outline().every(r => r.classList.contains('is-covered'))).toBe(true)
    expect($('.introduction-progress')?.textContent).toBe(
      `${HELP_SECTIONS.length} of ${HELP_SECTIONS.length} covered`,
    )
    press('Start again')
    expect(partTitle()).toBe(HELP_SECTIONS[0].title)
  })

  // Every page arrives under a pointer that has not moved.
  it('is deaf for a moment after each page', () => {
    signedOut()
    signIn()
    click(button('Start'))
    click(button('Next'))
    expect(partTitle(), 'Next answered straight after the page it is on arrived').toBe(HELP_SECTIONS[0].title)
  })

  it('reads a damaged history as nothing covered', () => {
    localStorage.setItem('peri_introduction', JSON.stringify({ Overview: 'yesterday', Other: 5 }))
    signedOut()
    signIn()
    expect(rowFor('Overview')?.classList.contains('is-covered')).toBe(false)
  })
})
