// The board itself: choosing a phrase off it, the slots that ask a question first, what it speaks as it is chosen, how much of it is rendered, and the guards that stop it answering a pointer that has not moved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import { PHRASES, hasChoices, parseSegments } from '../../src/core/phrases'
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
  writeIn,
} from './harness'
import { stylesheet } from '../stylesheet'

describe('resting', () => {
  const rest = () => $('.rest-btn')!
  const dwell = (el: Element, ms = 1500) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(ms))
    settle()
  }
  const startResting = () => click(rest())

  // Among the modes in the message card's row, rather than over the phrases.
  it('sits among the modes in the message card, not over the phrases', () => {
    renderApp()
    expect($('.message-wrap .message-tools .topbar-modes > .rest-btn')).not.toBeNull()
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
  it('says it, and puts it in the box', () => {
    renderApp()
    const cell = plainCell()
    click(cell)
    expect(spoken).toEqual([cell.textContent])
    expect(message()).toBe(cell.textContent)
  })

  it('activates by dwell as well as by click', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(1500))
    expect(message()).toBe(cell.textContent)
  })

  // **As edit mode opens it**: the full stop at the end is the phrase's own and
  // stays. Edit mode turned on opens the phrase itself, the box holding its own
  // wording — cut down, it was a copy that could not be saved.
  it('puts the phrase in the box as it was written, which edit mode opens', () => {
    // The whole board on screen, to find one phrase among thousands.
    unmeasuredGrid()
    renderApp()
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    expect(message()).toBe('I want a hug.')

    click(editToggle())
    expect(box().value).toBe('I want a hug.')
    expect($('.toast')?.textContent).toBe('Editing this phrase, in Library')
  })

  // Said as the board says it, and the phrase it came from rather than a new one.
  it('says it again without its full stop, and keeps nothing new', () => {
    unmeasuredGrid()
    renderApp()
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')!)
    expect(spoken).toEqual(['I want a hug', 'I want a hug'])
    const kept = JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}').custom ?? []
    expect(kept, 'the phrase was kept again for its full stop').toEqual([])
  })

  it('speaks with the user settings', () => {
    renderApp({ rate: 1.5, volume: 0.4 })
    click(plainCell())
    expect(spoken).toEqual([message()])
    expect(lastUtterance).toMatchObject({ rate: 1.5, volume: 0.4 })
  })
})

/**
 * **Edit mode is where a sentence is built out of phrases**, now that there is
 * no composing mode beside it: a phrase chosen into an empty box opens, to be
 * reworded or deleted, and one chosen into words goes in at the caret. Speak,
 * after Save, says the phrase being written and saves it.
 */
describe('building in edit mode', () => {
  const speakAndSave = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak and save')!
  const store = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}')
  const usage = () => JSON.parse(localStorage.getItem('peri_usage') ?? '{}')

  it('opens a phrase chosen into an empty box', () => {
    unmeasuredGrid()
    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    expect(box().value).toBe('I want a hug.')
    expect(spoken).toEqual([])
    expect($('.phrase-edit-bar')?.textContent ?? '', 'the phrase was not opened').not.toMatch(/new phrase/i)
  })

  it('puts a phrase chosen into words at the caret, and counts it as used', () => {
    unmeasuredGrid()
    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    const next = plainCell(['I want a hug.'])
    const id = next.getAttribute('data-phrase')!
    click(next)
    settle()
    expect(box().value).toBe(`I want a hug. ${next.textContent}`)
    expect([box().selectionStart, box().selectionEnd]).toEqual([box().value.length, box().value.length])
    expect(spoken, 'a phrase put in the box was said').toEqual([])
    expect(usage()[id]?.count).toBe(1)
  })

  it('puts it in at the caret rather than at the end', () => {
    unmeasuredGrid()
    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // The caret taken back to the start of the phrase.
    act(() => {
      box().setSelectionRange(0, 0)
      fireEvent.select(box())
    })
    const next = plainCell(['I want a hug.'])
    click(next)
    settle()
    expect(box().value).toBe(`${next.textContent} I want a hug.`)
  })

  it('says the phrase being written, and saves it', () => {
    renderApp()
    click(editToggle())
    writeIn(box(), 'Nobody has written this before')
    click(speakAndSave())
    expect(spoken).toEqual(['Nobody has written this before'])
    expect(store().custom.map((c: { text: string }) => c.text)).toEqual(['Nobody has written this before'])
    expect(box().value, 'saved, the draft starts again').toBe('')
  })

  // Library has it already: said, and nothing saved twice.
  it('only says words that are on the board already', () => {
    unmeasuredGrid()
    renderApp()
    click(editToggle())
    writeIn(box(), 'I want a hug.')
    click(speakAndSave())
    expect(spoken).toEqual(['I want a hug'])
    expect(store().custom ?? []).toEqual([])
  })

  it('asks for the choices before saying them, and keeps the phrase with them', () => {
    renderApp()
    click(editToggle())
    writeIn(box(), "I want the {['red', 'blue']} one")
    click(speakAndSave())
    expect($('.slot-picker')).not.toBeNull()
    click($$('.slot-option').find(o => o.textContent === 'blue'))
    expect(spoken).toEqual(['I want the blue one'])
    expect(store().custom.map((c: { text: string }) => c.text)).toEqual(["I want the {['red', 'blue']} one"])
  })

  it('has Save first and Speak after it', () => {
    renderApp()
    click(editToggle())
    writeIn(box(), 'Some words')
    expect($$('.after-text .icon-btn').map(b => b.getAttribute('aria-label'))).toEqual([
      'Save phrase',
      'Speak and save',
    ])
  })
})

/**
 * **A phrase with choices goes in the box as edit mode shows it**, its choices
 * still in it, and they are asked for when it is said. Filled in as it went in,
 * the box held one wording of the phrase rather than the phrase.
 */
describe('fill-in-the-blank phrases', () => {
  const VISIT = {
    id: 'custom-visit',
    text: "I need to see the {['doctor', 'nurse']} today.",
    category: 'Visits',
  }
  const visit = () => {
    localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify({ custom: [VISIT] }))
    // The whole board on screen, to find one phrase among thousands.
    unmeasuredGrid()
  }
  const visitCell = () =>
    cells().find(c => c.textContent?.startsWith('I need to see the') && c.textContent.endsWith('today.'))!
  const option = (words: string) => $$('.slot-option').find(o => o.textContent === words)!
  const speakButton = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')!
  const kept = () =>
    (JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}').custom ?? []).map(
      (p: { id: string }) => p.id,
    )

  it('asks for the choices as it is chosen, and keeps the phrase in the box', () => {
    visit()
    renderApp()
    click(visitCell())
    expect($('.slot-picker')).not.toBeNull()
    expect(message()).toBe(VISIT.text)
    expect(spoken).toEqual([])
    click(option('nurse'))
    expect($('.slot-picker')).toBeNull()
    expect(spoken).toEqual(['I need to see the nurse today'])
    expect(message()).toBe(VISIT.text)
    expect(kept(), 'the phrase was kept again with its choices made').toEqual(['custom-visit'])
  })

  // The box still holds the phrase, so Speak asks again.
  it('asks again when it is said again', () => {
    visit()
    renderApp()
    click(visitCell())
    click(option('nurse'))
    click(speakButton())
    expect($('.slot-picker')).not.toBeNull()
    click(option('doctor'))
    expect(spoken).toEqual(['I need to see the nurse today', 'I need to see the doctor today'])
  })

  // Built in edit mode, after another phrase: in at the caret as edit mode
  // shows it, and asked for when it is said.
  it('goes in at the caret in edit mode, and is asked for when said', () => {
    visit()
    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    click(visitCell())
    settle()
    expect(box().value).toBe(`I want a hug. ${VISIT.text}`)
    expect($('.slot-picker')).toBeNull()
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak and save')!)
    click(option('doctor'))
    expect(spoken).toEqual(['I want a hug. I need to see the doctor today'])
  })

  it('says nothing when the choices are cancelled, and leaves the box alone', () => {
    visit()
    renderApp()
    click(visitCell())
    click($('.slot-cancel'))

    expect($('.slot-picker')).toBeNull()
    expect(spoken).toEqual([])
    expect(message()).toBe(VISIT.text)
  })

  // The box holds the phrase's own words, so edit mode opens the phrase.
  it('opens the phrase itself when edit mode is turned on over it', () => {
    visit()
    renderApp()
    click(visitCell())
    click($('.slot-cancel'))
    click(editToggle())
    expect(box().value).toBe(VISIT.text)
    expect($('.toast')?.textContent).toMatch(/^Editing this phrase/)
  })
})

describe('auto-speak', () => {
  // The three modes share one strip across the top of the message box, in the
  // order edit, Rest, auto-speak — and please after them. DOM order is what can be checked here — jsdom
  // lays nothing out — but in a flex row with nothing setting `order` that is
  // also the order they are seen in, left to right.
  it('sits to the right of Rest, with edit to its left', () => {
    renderApp()
    const strip = $$('.topbar-modes > *')
    expect(strip.map(el => el.className.split(' ')[0])).toEqual([
      'mode-btn',
      'rest-btn',
      'mode-btn',
      'mode-btn',
      'mode-btn',
    ])
    expect(strip[0].getAttribute('aria-label')).toMatch(/edit/i)
    expect(strip[2].getAttribute('aria-label')).toMatch(/auto-speak/i)
    expect(strip[3].getAttribute('aria-label')).toMatch(/please/i)
    expect(strip[4].getAttribute('aria-label')).toMatch(/present/i)
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
  })

  // In the box as well, so it can be copied, said again or typed over — and
  // selected, so the next key typed writes over it rather than after it.
  it('speaks the phrase and puts it in the box, selected', () => {
    renderApp({ autoSpeak: true })
    const cell = plainCell()
    click(cell)

    expect(spoken).toEqual([cell.textContent])
    expect(message()).toBe(cell.textContent)
    const box = $<HTMLTextAreaElement>('.text-display')!
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length])
    expect(document.activeElement).toBe(box)
  })

  it('puts each phrase said in place of what the box held, which Undo brings back', () => {
    renderApp({ autoSpeak: true })
    // Typed, so the board narrows to it — and the phrase chosen from what it
    // found takes the typing's place.
    writeIn($<HTMLTextAreaElement>('.text-display')!, 'I want')
    const first = plainCell()
    click(first)
    expect(message(), 'the typing was not replaced').toBe(first.textContent)

    const second = plainCell([first.textContent ?? ''])
    click(second)
    expect(message(), 'the second phrase did not replace the first').toBe(second.textContent)
    const said = message()

    const named = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
    click(named('Clear'))
    expect(message()).toBe('')
    click(named('Undo'))
    expect(message()).toBe(said)
  })

  // As it was stored, not as it was cut down to be built on: the full stop at
  // the end is the phrase's own, and stays.
  it('puts the phrase in the box as it was written', () => {
    // The whole board on screen, to find one phrase among thousands.
    unmeasuredGrid()
    renderApp({ autoSpeak: true })
    const cell = cells().find(c => c.textContent === 'I want a hug.')!
    click(cell)
    expect(spoken).toEqual(['I want a hug'])
    expect(message()).toBe('I want a hug.')
  })

  // Chosen by resting rather than clicking: a dwell fires from a timer, and the
  // box was once selected on a timer set beside it that ran first.
  it('selects the phrase when it is chosen by resting', () => {
    renderApp({ autoSpeak: true })
    const cell = plainCell()
    fireEvent.pointerMove(document.body, { clientX: 5, clientY: 5 })
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.phraseDwellMs))
    const box = $<HTMLTextAreaElement>('.text-display')!
    expect(box.value).toBe(cell.textContent)
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length])
  })

  // A phrase in the box is not something being typed: the board stays as it
  // was, tabs and all, rather than narrowing to the phrase's words.
  it('leaves the board as it was rather than searching for the phrase', () => {
    renderApp({ autoSpeak: true })
    const before = cells().length
    click(plainCell())
    expect(cells().length).toBe(before)
    expect($('.filter-bar-wrap'), 'the tabs went, as they do for typing').not.toBeNull()
  })

  // Turned off, the board builds on what was said rather than in front of it.
  it('builds after the phrase once auto-speak is off', () => {
    renderApp({ autoSpeak: true })
    const first = plainCell()
    click(first)
    click(speakToggle())
    const second = plainCell([first.textContent ?? ''])
    click(second)
    expect(message()).toBe(`${first.textContent} ${second.textContent}`)
  })

  // Said straight away, so the choices are asked for straight away — and the
  // box holds the phrase as edit mode shows it, selected, as any phrase said is.
  it('asks for the choices at once, says them, and puts the phrase in the box', () => {
    renderApp({ autoSpeak: true })
    const cell = slotCell()
    click(cell)
    expect($('.slot-picker')).not.toBeNull()
    expect(message(), 'the box does not hold the phrase as edit mode does').toMatch(/\{.*\}/)
    const box = $<HTMLTextAreaElement>('.text-display')!
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length])
    const held = message()
    fillEverySlot()

    expect(spoken).toHaveLength(1)
    expect(spoken[0]).not.toMatch(/[{}]/)
    expect(message()).toBe(held)
  })

  // **Two ways of working, and always one of them.** There was a third —
  // composing — and it was taken out on request: switching auto-speak off is
  // switching edit mode on, and the other way round.
  it('goes to edit mode when it is switched off, and back when edit goes off', () => {
    renderApp()
    click(speakToggle())
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
    expect(editToggle().getAttribute('aria-pressed')).toBe('true')
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)

    click(editToggle())
    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')
    expect(editToggle().getAttribute('aria-pressed')).toBe('false')

    click(editToggle())
    click(speakToggle())
    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')
    expect(editToggle().getAttribute('aria-pressed')).toBe('false')
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

      const css = stylesheet()
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

const hasChoicesIn = (source: string) => hasChoices(parseSegments(source))

describe('a phrase with a blank', () => {
  // The blank is there to be typed into, and a dwell user cannot place a caret
  // by clicking — so selecting it, in edit mode where the phrase goes in at
  // the caret as edit mode shows it, is the whole of that feature: the next
  // word typed fills it.
  it('selects the gap in edit mode, ready to type into', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    const midBlank = PHRASES.find(p => /\{\s*\}\s*\S/.test(p.source) && !hasChoicesIn(p.source))!
    expect(midBlank, 'no phrase on the board has a gap with words after it').toBeDefined()

    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    click(cells().find(c => c.getAttribute('data-phrase') === midBlank.id)!)
    settle()

    const b = box()
    expect(b.value.slice(b.selectionStart, b.selectionEnd), 'the gap is not what is selected').toMatch(/^\{\s*\}$/)
    expect(b.value.slice(b.selectionEnd), 'the words after the gap went').not.toBe('')
  })

  it('sits at the end when there is no blank to land on', () => {
    unmeasuredGrid()
    renderApp()
    click(editToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    click(plainCell(['I want a hug.']))
    settle()

    const b = box()
    expect(b.selectionStart).toBe(b.value.length)
    expect(b.selectionStart).toBe(b.selectionEnd)
  })
})

/**
 * **Measuring needs something rendered to measure.** So the grid renders a
 * screenful first and windows from what that measures, rather than mounting all
 * two thousand-odd cells on the way — which it did on every load, and
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
  // mechanism either way, and mounting two thousand cells eight more times
  // costs the build machine more memory than the coverage is worth — so the
  // board is given a long category of its own, and a short one to leave it for.
  const CATEGORY = 'Long'
  beforeEach(() =>
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [
          ...Array.from({ length: 250 }, (_, i) => ({
            id: `custom-long-${i}`,
            text: `Long list line ${i}`,
            category: 'Long',
          })),
          { id: 'custom-short', text: 'Only one here', category: 'Short' },
        ],
      }),
    ),
  )
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

    click(tabNamed('Short'))
    click(tabNamed(CATEGORY))

    expect(rendered()).toBe(60)
  })

  it('starts again from the top when the list changes', () => {
    openCategory()
    click($$('.scroll-btn').find(b => b.getAttribute('aria-label') === 'Scroll to bottom'))

    // Nothing in Library says this, so the list the window was over is gone.
    fireEvent.change($('.text-display')!, { target: { value: 'zzqx' } })
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

// The texting acronyms' expansions came in a category of their own, and are in
// Library with everything else now — found by typing the acronym, which is what
// made a category that size usable in the first place.
describe('the texting expansions', () => {
  const tabs = () => $$('.filter-tab[role="tab"]')
  const tabNamed = (name: string) => tabs().find(el => el.textContent === name)

  it('are in Library rather than a tab of their own', () => {
    renderApp()
    expect(tabNamed('Texting')).toBeUndefined()
    expect(tabNamed('Library')).toBeDefined()
  })

  it('fill the grid as expansions rather than acronyms', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    click(tabNamed('Library'))

    const texts = cells().map(c => c.textContent)
    expect(texts).toContain('Be right back')
    expect(texts).toContain('Talk to you later')
    // Spoken aloud, "B R B" is not a sentence.
    expect(texts).not.toContain('BRB')
  })

  // Adults swear, and an AAC board that cannot is a board that puts its user in
  // a register they did not choose. The word is cut to its first letter, which
  // is also the letter its acronym uses.
  it('carry the profane ones cut to a letter', () => {
    renderApp()
    click(tabNamed('Library'))

    fireEvent.change($('.text-display')!, { target: { value: 'wtf' } })
    settle()

    expect(cells().map(c => c.textContent)).toContain('What the f')
  })

  it('narrow to a phrase when its acronym is typed', () => {
    renderApp()
    click(tabNamed('Library'))

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
    click(editToggle())
    expect(toast()).toMatch(/edit mode/i)

    act(() => void vi.advanceTimersByTime(5000))

    expect(toast()).toMatch(/edit mode/i)
  })

  it('goes on the next dwell, whatever it is', () => {
    renderApp()
    click(editToggle())
    expect(toast()).toBeTruthy()

    // Translations rather than Library: Library is where the board opens, and
    // the tab already showing does not answer to a dwell at all.
    click(tab('Translations'))

    expect(toast()).toBeUndefined()
  })

  // Every control tells its listeners before its own action, so the dwell
  // that raises a message is not the one that takes it away.
  it('stays for the dwell that raised it', () => {
    renderApp()
    click(editToggle())

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
