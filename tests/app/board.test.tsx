// The board itself: choosing a phrase off it, the slots that ask a question first, what it speaks as it is chosen, how much of it is rendered, and the guards that stop it answering a pointer that has not moved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PHRASES, composeWithBlank, hasBlank } from '../../src/core/phrases'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { lastUtterance, spoken, unmeasuredGrid } from '../setup'
import {
  $$,
  $,
  settle,
  click,
  renderApp,
  renderFresh,
  message,
  cells,
  editToggle,
  speakToggle,
  plainCell,
  fillEverySlot,
  slotCell,
  box,
} from './harness'

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
    renderApp({ rate: 1.5, volume: 0.4, autoSpeak: false })
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
    fillEverySlot()

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
  it('sits to the right of Rest, with edit to its left', () => {
    renderApp()
    const strip = $$('.topbar-modes > *')
    expect(strip.map(el => el.className.split(' ')[0])).toEqual(['mode-btn', 'rest-btn', 'mode-btn'])
    expect(strip[0].getAttribute('aria-label')).toMatch(/edit/i)
    expect(strip[2].getAttribute('aria-label')).toMatch(/auto-speak/i)
  })

  // The empty box is where somebody looks to learn what a dwell on a phrase
  // will do, so it says so in the words of the mode — and says something else
  // the moment the mode is something else.
  it('says in the empty box what choosing a phrase will do', () => {
    renderApp({ autoSpeak: true })
    expect(box().placeholder).toBe('Immediately speak selected phrase')

    click(speakToggle())
    expect(box().placeholder, 'composing still promised to speak').not.toMatch(/speak selected/i)
  })

  // The board talks the moment it is opened. Somebody who wants to build a
  // sentence out of several phrases turns this off; somebody who wants a button
  // that says a thing has nothing to find first.
  it('is on before anybody has chosen anything', () => {
    renderFresh()
    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')

    const cell = plainCell()
    click(cell)
    expect(spoken).toEqual([cell.textContent])
    expect(message()).toBe('')
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
    fillEverySlot()

    expect(spoken).toHaveLength(1)
    expect(spoken[0]).not.toMatch(/[{}]/)
    expect(message()).toBe('')
  })

  // **Switching one off says nothing about the other.** This landed in edit
  // mode for most of the app's life, on the grounds that somebody who does not
  // want a phrase spoken must want to change it — so the one toggle a person
  // building a sentence reaches for put them in the one mode where a dwell
  // rewrites the board, and composing, which is what they were after, took a
  // second dwell on the other control to reach.
  it('goes to composing when it is switched off, never to edit mode', () => {
    renderApp({ autoSpeak: true })
    click(speakToggle())

    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
    expect(editToggle().getAttribute('aria-pressed')).toBe('false')
    expect($('.app')?.classList.contains('edit-mode')).toBe(false)

    // The board is collecting rather than saying or opening, in one dwell.
    const cell = plainCell()
    click(cell)
    expect(spoken).toEqual([])
    expect(message()).toBe(cell.textContent)
  })

  // Stored like every other setting, and ignored on the way back in. A board
  // has to open ready to talk however it was left; somebody who would rather
  // build messages is two dwells from doing so, and being unable to say
  // anything is not recoverable in the same way.
  it('comes back on when the page loads, however it was left', () => {
    renderFresh()
    click(speakToggle()) // to edit mode, and the change is written down
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).autoSpeak).toBe(false)

    cleanup()
    renderFresh()

    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')
  })

  // Somebody with a keyboard can type the first thing they want to say without
  // having to put the caret in the box first — which is the one thing a dwell
  // could not do at all until the box grew a dwell of its own.
  it('opens with the message box already focused', () => {
    renderFresh()
    expect(document.activeElement).toBe($('.text-display'))
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

    // Six controls in a column need vertical room, and a short screen has none
    // to spare. The pages are the pair that goes: a nudge repeats while held, so
    // it crosses the same distance, and the ends still reach either end.
    //
    // This can only check that the rule is written and that it names the two
    // arrows it is meant to. jsdom applies no cascade and lays nothing out, so
    // whether it takes effect is a question for the deploy preview.
    it('goes off a short screen, and takes nothing else with it', () => {
      renderApp()
      const named = $$('.scroll-btn-page').map(b => b.getAttribute('aria-label'))
      expect(named).toEqual(['Previous page', 'Next page'])

      const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
      // Height alone, and no orientation clause — see the rule for why.
      expect(css).toMatch(/@media \(max-height: 700px\) \{\s*\.scroll-btn-page \{\s*display: none;/)
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
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
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

/**
 * **Measuring needs something rendered to measure.** So the grid renders a
 * screenful first and windows from what that measures, rather than mounting all
 * two and a half thousand cells on the way — which it did on every load, and
 * which was most of what this suite spent its time on.
 *
 * Asked of the document before the effects have run, because that is the only
 * moment the answer is visible: the measuring happens as soon as they do.
 */
describe('the first window, before anything has been measured', () => {
  /** What is in the document at the first commit, effects not yet run. */
  function atFirstPaint(): number {
    localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    flushSync(() => root.render(<App />))
    const cellsThen = host.querySelectorAll('.phrase-cell').length
    act(() => root.unmount())
    host.remove()
    return cellsThen
  }

  it('mounts a screenful rather than the table', () => {
    const onFirstPaint = atFirstPaint()
    expect(onFirstPaint, 'the whole table went in before anything could be measured').toBeLessThan(300)
    expect(onFirstPaint, 'too little to fill a screen with').toBeGreaterThan(50)
  })

  // What every test here runs against, and the reason they are quick: the setup
  // gives the grid a viewport, so the board windows as it does in a browser.
  it('windows to what the viewport measures, once it has', () => {
    renderApp()
    expect(cells().length, 'the board is holding the whole table').toBeLessThan(300)
    expect(cells().length).toBeGreaterThan(50)
  })

  // The fallback still has the last word where there is nothing to measure: a
  // phrase out of reach is worse than a slow grid.
  it('grows to the whole table when there is nothing to measure', () => {
    unmeasuredGrid()
    renderApp()
    expect(cells().length).toBeGreaterThan(2000)
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

  // jsdom's own, put back after each test rather than deleted: deleting it left
  // every element in every later test with no `offsetHeight` at all, which
  // nothing noticed until the message box began reading it for its border.
  // This block supplies the grid's geometry itself, so the viewport every other
  // test is given would be a second answer to the same question.
  beforeEach(() => unmeasuredGrid())

  const jsdomOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
  afterEach(() => {
    // On the prototype, so without this every element in every test after this
    // block reports a height it does not have.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', jsdomOffsetHeight)
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

describe('settling after the screen moves', () => {
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const nav = (label: string) => $$('.nav-item').find(n => n.getAttribute('aria-label') === label)

  /** Rest on a phrase for long enough that it would be chosen. */
  const restOnAPhrase = () => {
    const cell = plainCell()
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.phraseDwellMs + 50))
    return cell
  }

  // The text size is applied on the way in as well as when it changes, and
  // nothing has moved on the way in. An app that will not answer for its first
  // second is an app that looks broken.
  it('answers straight away when the board opens', () => {
    renderApp({ autoSpeak: true })

    restOnAPhrase()
    expect(spoken, 'the board was deaf when it opened').toHaveLength(1)
  })

  // Back is the way out of the menu, and the way out lands on the board — where
  // what is under the pointer is a phrase that would be spoken aloud.
  it('says nothing when Back drops the board under the pointer', () => {
    renderApp({ autoSpeak: true })
    openMenu()

    click($('.panel-back'))
    restOnAPhrase()
    expect(spoken, 'a phrase fired under a pointer that had not moved').toEqual([])

    // And it is a pause, not a stop: once the second is up the board answers.
    act(() => void vi.advanceTimersByTime(1100))
    restOnAPhrase()
    expect(spoken).toHaveLength(1)
  })

  // Changing the text size relays out every control on the screen around a
  // pointer that has not moved with them.
  it('says nothing when the text size moves everything', () => {
    renderApp({ autoSpeak: true })
    openMenu()
    click(nav('Settings'))
    const textSize = $$('.setting-row').find(r => r.textContent?.startsWith('Text size'))!
    const bigger = [...textSize.querySelectorAll('.step-btn')].find(
      b => b.getAttribute('aria-label') === 'Increase',
    )!

    click(bigger)
    // A control that is not the one just used, resting under a pointer that has
    // not moved: it must not start filling.
    fireEvent.pointerEnter(textSize.querySelector('.setting-number')!)
    const other = $$('.step-btn').find(b => b.getAttribute('aria-label') === 'Decrease')!
    fireEvent.pointerEnter(other)
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.actionDwellMs + 50))
    expect(other.className, 'a control armed while the screen was still moving').not.toMatch(/dwelling/)

    // A pause, not a stop.
    act(() => void vi.advanceTimersByTime(1100))
    fireEvent.pointerLeave(other)
    fireEvent.pointerEnter(other)
    expect(other.className).toMatch(/dwelling/)
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
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
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

/**
 * The line that says what just happened. It went after two seconds, and for a
 * save, a refused paste or a blocked link it is the only thing that says
 * anything — a gaze on the board rather than on the corner could miss all of
 * it. So it stays until the next dwell, the rule the mark on the last phrase
 * said follows.
 */
describe('the line that says what just happened', () => {
  const toast = () => $('.toast')?.textContent
  const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)

  it('is still there after the two seconds it used to last', () => {
    renderApp()
    expect(toast()).toMatch(/auto-speak off/i)

    act(() => void vi.advanceTimersByTime(5000))

    expect(toast()).toMatch(/auto-speak off/i)
  })

  it('goes on the next dwell, whatever it is', () => {
    renderApp()
    expect(toast()).toBeTruthy()

    // Sent rather than All: All is where the board opens, and the tab already
    // showing does not answer to a dwell at all.
    click(tab('Sent'))

    expect(toast()).toBeUndefined()
  })

  // Every control tells its listeners before its own action, so the dwell
  // that raises a message is not the one that takes it away.
  it('stays for the dwell that raised it', () => {
    renderApp()

    click(speakToggle())

    expect(toast()).toMatch(/auto-speak on/i)
  })

  // A board somebody has walked away from should not greet them with news
  // about whatever they do next.
  it('goes by itself on a board nobody is working', () => {
    renderApp()

    act(() => void vi.advanceTimersByTime(10_500))

    expect(toast()).toBeUndefined()
  })
})
