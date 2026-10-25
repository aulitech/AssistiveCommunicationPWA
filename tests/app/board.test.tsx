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
  speakToggle,
  plainCell,
  placeCells,
  fillEverySlot,
  slotCell,
  box,
  writeIn,
} from './harness'
import { stylesheet } from '../stylesheet'

describe('resting', () => {
  const rest = () => $('.rest-surface')!
  const dwell = (el: Element, ms = 1500) => {
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(ms))
    settle()
  }
  const startResting = () => click(rest())
  /** The pointer out of the row of controls, which Rest and Resume wait for. */
  const leaveRow = () => {
    fireEvent.pointerLeave($('.message-tools')!)
    settle()
  }
  /** Out of the row and back onto Resume. */
  const resume = () => {
    leaveRow()
    click($('.resume-bar'))
  }

  // **No keyboard over a board at rest.** The caret comes out of the box, and
  // with it the keyboard a phone or browser raises for one; the box wants none
  // while resting, however it is asked; nothing puts the caret back until
  // Resume does; and a keyboard asked for before resting is not still asked
  // for after it, Resume being a choice somewhere else.
  it('takes the caret out of the box while resting, and wants no system keyboard', () => {
    renderApp()
    const box = $<HTMLTextAreaElement>('.text-display')!
    expect(document.activeElement).toBe(box)
    fireEvent.pointerDown(box)
    expect(box.getAttribute('inputmode'), 'asked for, and refused').toBeNull()

    startResting()
    expect(document.activeElement, 'the caret stayed in the box').not.toBe(box)
    expect(box.getAttribute('inputmode')).toBe('none')
    // Tapped while resting: still none.
    fireEvent.pointerDown(box)
    settle()
    expect(box.getAttribute('inputmode'), 'a tap raised a keyboard while resting').toBe('none')
    // Focus falling to nothing puts nothing back while resting — the box
    // tapped and left, say.
    act(() => {
      box.focus()
      box.blur()
    })
    act(() => void vi.advanceTimersByTime(50))
    expect(document.activeElement, 'put back while resting').not.toBe(box)

    resume()
    expect(document.activeElement, 'Resume did not put the caret back').toBe(box)
    expect(box.getAttribute('inputmode'), 'Resume brought back a keyboard nobody asked for').toBe('none')
  })

  // **The open space in the message card's row of controls**: a surface
  // behind everything in that row, which the row lets the pointer through to
  // wherever nothing answers. Where it is drawn and what reaches it is
  // `e2e/layout.spec.ts`'s question; this is that it is there, and only there.
  it('is the open space of the message card’s row of controls, and nowhere else', () => {
    renderApp()
    expect($$('.rest-surface')).toHaveLength(1)
    expect($('.message-wrap > .message-tools > .rest-surface')).not.toBeNull()
    expect($('.rest-btn'), 'the bar it replaced').toBeNull()
    const css = stylesheet()
    expect(css).toMatch(/\.message-tools > :not\(\.rest-surface\) \* \{ pointer-events: none; \}/)
    expect(css).toMatch(/\.message-tools :is\([^)]*\[role='button'\][^)]*\) \{ pointer-events: auto; \}/)
    expect(css, 'the rest of the top row passes the pointer on').not.toMatch(/\.topbar > :not\(\.rest-surface\)/)
  })

  // No ground of its own until it is rested on or resting: the row looks as
  // it always did.
  it('draws nothing of its own at rest', () => {
    const rule = stylesheet().match(/\n\.rest-surface \{([^}]*)\}/)![1]
    expect(rule).not.toMatch(/background/)
  })

  // **Resume, over the row of controls while resting** — opaque, in the
  // brand's gold a little muted, the word near-black — and the way back.
  it('covers the row of controls with Resume while resting, which resumes', () => {
    renderApp()
    expect($('.resume-bar')).toBeNull()

    startResting()
    const bar = $('.message-tools > .resume-bar')!
    expect(bar.textContent).toBe('Resume')
    expect(bar.getAttribute('aria-label')).toMatch(/^Resume\./)
    const rule = stylesheet().match(/\n\.resume-bar \{([^}]*)\}/)![1]
    expect(rule).toMatch(/background: color-mix\(in srgb, var\(--brand\) \d+%, #000\);/)
    expect(rule).toMatch(/color: var\(--bg\);/)

    resume()
    expect($('.app')?.classList.contains('resting')).toBe(false)
    expect($('.resume-bar')).toBeNull()
  })

  // Resume comes up where the rest was, under a pointer that has not moved,
  // and Rest comes back where Resume was: **neither answers until the pointer
  // has left the row** — or a gaze that stayed put would switch straight back.
  it('waits for the pointer to leave the row before answering again', () => {
    renderApp()
    startResting()

    click($('.resume-bar'))
    expect($('.app')?.classList.contains('resting'), 'resumed without leaving the row').toBe(true)

    resume()
    expect($('.app')?.classList.contains('resting')).toBe(false)

    click(rest())
    expect($('.app')?.classList.contains('resting'), 'rested again without leaving the row').toBe(false)
    leaveRow()
    click(rest())
    expect($('.app')?.classList.contains('resting')).toBe(true)
  })

  // **Paused, large and in the middle of the screen**, while resting — and
  // never in the way of resuming.
  it('says Paused in the middle of the screen while resting, and only then', () => {
    renderApp()
    expect($('.paused-note')).toBeNull()

    startResting()
    expect($('.paused-note')?.textContent).toBe('Paused')
    expect($('.paused-note')?.getAttribute('role')).toBe('status')
    expect(stylesheet()).toMatch(/\.paused-note \{[^}]*pointer-events: none;/)

    resume()
    expect($('.paused-note')).toBeNull()
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
    resume()

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

    click(speakToggle())
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
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    expect(box().value).toBe('I want a hug.')
    expect(spoken).toEqual([])
    expect($('.phrase-edit-bar')?.textContent ?? '', 'the phrase was not opened').not.toMatch(/new phrase/i)
  })

  it('puts a phrase chosen into words at the caret, and counts it as used', () => {
    unmeasuredGrid()
    renderApp()
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    fireEvent.change(box(), { target: { value: 'I want a hug. ' } })
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
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    fireEvent.change(box(), { target: { value: 'I want a hug. ' } })
    settle()
    // The caret taken back to the start of the phrase.
    act(() => {
      box().setSelectionRange(0, 0)
      fireEvent.select(box())
    })
    const next = plainCell(['I want a hug.'])
    click(next)
    settle()
    expect(box().value).toBe(`${next.textContent} I want a hug. `)
  })

  it('says the phrase being written, and saves it', () => {
    renderApp()
    click(speakToggle())
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
    click(speakToggle())
    writeIn(box(), 'I want a hug.')
    click(speakAndSave())
    expect(spoken).toEqual(['I want a hug'])
    expect(store().custom ?? []).toEqual([])
  })

  it('asks for the choices before saying them, and keeps the phrase with them', () => {
    renderApp()
    click(speakToggle())
    writeIn(box(), "I want the {['red', 'blue']} one")
    click(speakAndSave())
    expect($('.slot-picker')).not.toBeNull()
    click($$('.slot-option').find(o => o.textContent === 'blue'))
    expect(spoken).toEqual(['I want the blue one'])
    expect(store().custom.map((c: { text: string }) => c.text)).toEqual(["I want the {['red', 'blue']} one"])
  })

  it('has Save first and Speak after it', () => {
    renderApp()
    click(speakToggle())
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
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    fireEvent.change(box(), { target: { value: 'I want a hug. ' } })
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
    click(speakToggle())
    expect(box().value).toBe(VISIT.text)
    expect($('.toast')?.textContent).toMatch(/^Editing this phrase/)
  })
})

describe('auto-speak', () => {
  // The modes share one strip across the top of the message box: auto-speak,
  // whose off is edit mode, and please and present after it. DOM
  // order is what can be checked here — jsdom lays nothing out — but in a flex
  // row with nothing setting `order` that is also the order they are seen in.
  it('comes first among the modes, with no edit button beside it', () => {
    renderApp()
    const strip = $$('.topbar-modes > *')
    expect(strip.map(el => el.className.split(' ')[0])).toEqual(['mode-btn', 'mode-btn', 'mode-btn'])
    expect(strip[0].getAttribute('aria-label')).toMatch(/auto-speak/i)
    expect(strip[1].getAttribute('aria-label')).toMatch(/please/i)
    expect(strip[2].getAttribute('aria-label')).toMatch(/present/i)
  })

  // The empty box is where somebody looks to learn what a dwell on a phrase
  // will do, so it says so in the words of the mode — and says something else
  // the moment the mode is something else.
  it('says in the empty box what choosing a phrase will do', () => {
    renderApp({ autoSpeak: true })
    expect(box().placeholder).toBe('Choose a phrase')

    click(speakToggle())
    expect(box().placeholder, 'editing still promised to speak').toBe('Write or choose one')
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
    // Opened in edit mode; changed, so the board can be chosen from again.
    fireEvent.change(box(), { target: { value: `${first.textContent} ` } })
    settle()
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

  // **Two ways of working, and always one of them** — so one control:
  // auto-speak, lit while it is on, and edit mode while it is off. There was a
  // third, composing, taken out on request; and then an edit button beside it,
  // one of the two always lit, which said the mode twice.
  it('is the one mode control: lit for auto-speak, unlit for edit mode', () => {
    renderApp()
    const icon = () => speakToggle().querySelector('svg')!.outerHTML
    const lit = () => speakToggle().classList.contains('active')
    expect($('.edit-toggle')).toBeNull()
    const autoSpeak = icon()
    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')
    expect(lit()).toBe(true)

    click(speakToggle())
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
    expect(lit()).toBe(false)
    expect(icon()).toBe(autoSpeak)

    click(speakToggle())
    expect($('.app')?.classList.contains('edit-mode')).toBe(false)
    expect(lit()).toBe(true)
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

/**
 * **The two arrows over the grid**, the whole of its scrolling: up at the top
 * of the rightmost column and down at its foot, each half a cell high and a
 * third of one wide, a page of five sixths per dwell, landing on a row's top.
 * jsdom lays nothing out, so where the cells are is supplied (`placeCells`).
 */
describe('the arrows over the grid', () => {
  const arrow = (which: 'up' | 'down') => $<HTMLElement>(`.grid-arrow.is-${which}`)!
  const grid = () => $<HTMLElement>('.grid-wrapper')!
  /** Where the grid has been asked to go, and the scroll it would have made. */
  const follow = () => {
    const scrollTo = vi.fn((to: ScrollToOptions) => {
      grid().scrollTop = to.top ?? 0
      fireEvent.scroll(grid())
    })
    grid().scrollTo = scrollTo as unknown as HTMLElement['scrollTo']
    return scrollTo
  }

  it('replaces the rail: no column of controls beside the grid', () => {
    renderApp()
    expect($('.grid-scrollbar')).toBeNull()
    expect($$('.grid-arrow').map(a => a.getAttribute('aria-label'))).toEqual(['Previous page', 'Next page'])
  })

  it('is half a cell high and a third of one wide', () => {
    placeCells({ width: 150, rowHeight: 80 })
    renderApp()
    expect(arrow('down').style.getPropertyValue('--arrow-w')).toBe('50px')
    expect(arrow('down').style.getPropertyValue('--arrow-h')).toBe('40px')
  })

  // Five sixths of 400 is 333; the rows start every 80px, so the last whole
  // row there starts at 320 — and the row at the top of the new view is whole.
  it('pages five sixths of the view, landing on the top of a row', () => {
    placeCells()
    renderApp()
    const scrollTo = follow()

    /**
     * Away from the arrows and past the half second between pages. A click goes
     * on paging while the pointer stays, as a rest does; leaving stops it.
     */
    const settleDown = () => {
      fireEvent.pointerLeave(arrow('down'))
      fireEvent.pointerLeave(arrow('up'))
      act(() => void vi.advanceTimersByTime(600))
    }

    click(arrow('down'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: 'smooth' })

    settleDown()
    click(arrow('down'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'smooth' })

    // Back up: 640 less 333 is 307, and the nearest row top there or below it is 320.
    settleDown()
    click(arrow('up'))
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: 'smooth' })
  })

  it('shows each only while there is somewhere to go', () => {
    placeCells()
    renderApp()
    follow()
    expect(arrow('up').classList.contains('is-hidden'), 'up, at the top').toBe(true)
    expect(arrow('down').classList.contains('is-hidden')).toBe(false)

    click(arrow('down'))
    expect(arrow('up').classList.contains('is-hidden')).toBe(false)
  })

  // On while the pointer stays, at the Auto-repeat setting, so a long way down
  // is one rest rather than one each.
  it('keeps paging while the pointer stays', () => {
    placeCells()
    renderApp({ actionDwellMs: 800, repeatDelayMs: 500 })
    const scrollTo = follow()

    fireEvent.pointerEnter(arrow('down'))
    act(() => void vi.advanceTimersByTime(800))
    expect(scrollTo).toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(1500))
    expect(scrollTo.mock.calls.length, 'the arrow did not repeat').toBe(4)
  })

  /**
   * **Debounced.** A rest that fires and a gaze rig's click straight after it,
   * or a page asked for while the last is still scrolling, move the grid once.
   */
  it('takes one page for two asked for together, and none while the grid is still moving', () => {
    placeCells()
    renderApp()
    const scrollTo = follow()

    click(arrow('down'))
    click(arrow('down'))
    expect(scrollTo, 'two pages for two clicks a moment apart').toHaveBeenCalledTimes(1)

    // Past the half second, but the grid still moving from the last page.
    act(() => void vi.advanceTimersByTime(600))
    fireEvent.scroll(grid())
    click(arrow('down'))
    expect(scrollTo, 'a page while the grid was still moving').toHaveBeenCalledTimes(1)

    act(() => void vi.advanceTimersByTime(600))
    click(arrow('down'))
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it('is hidden where there is no cell to size it by', () => {
    renderApp()
    expect(arrow('down').classList.contains('is-hidden')).toBe(true)
    expect(arrow('down').getAttribute('aria-hidden')).toBe('true')
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
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    fireEvent.change(box(), { target: { value: 'I want a hug. ' } })
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
    click(speakToggle())
    click(cells().find(c => c.textContent === 'I want a hug.')!)
    settle()
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    fireEvent.change(box(), { target: { value: 'I want a hug. ' } })
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

  /** Scrolled to the end of what is rendered, which asks for more. */
  const scrollToTheEnd = () => {
    setGeometry($('.grid-wrapper')!, { scrollTop: 1400, clientHeight: 200, scrollHeight: 1600 })
    act(() => void fireEvent.scroll($('.grid-wrapper')!))
    settle()
  }

  // Without this the window stays as wide as it grew, and coming back to a long
  // list after scrolling to the end of it renders the whole thing again.
  it('narrows again when a long list comes back', () => {
    openCategory()
    scrollToTheEnd()
    expect(rendered()).toBeGreaterThan(60)
    // At the top again, as another tab leaves it — the end is not still in view.
    setGeometry($('.grid-wrapper')!, { scrollTop: 0, clientHeight: 200, scrollHeight: 1600 })

    click(tabNamed('Short'))
    click(tabNamed(CATEGORY))

    expect(rendered()).toBe(60)
  })

  it('starts again from the top when the list changes', () => {
    openCategory()
    scrollToTheEnd()

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
    click(speakToggle())
    expect(toast()).toMatch(/edit mode/i)

    act(() => void vi.advanceTimersByTime(5000))

    expect(toast()).toMatch(/edit mode/i)
  })

  it('goes on the next dwell, whatever it is', () => {
    renderApp()
    click(speakToggle())
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
    click(speakToggle())

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

// **The cell under the pointer, magnified**, as the Dock does: grown out of
// the place it holds in the grid, which keeps that place, so nothing else on
// the board moves. Where it is drawn and how big is `e2e/layout.spec.ts`'s
// question; this is when.
describe('the magnified cell', () => {
  const place = (cell: Element) => cell.closest('.phrase-place')!
  const frame = () => act(() => void vi.advanceTimersByTime(20))

  // Every control asks, as the pointer enters it, whether it came to the
  // pointer — and a cell already grown over where the pointer was would be
  // refused as one that had.
  it('grows a frame after the pointer arrives, not in the same event', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerOver(cell)
    expect(place(cell).classList.contains('is-magnified'), 'grown in the event that entered it').toBe(false)
    frame()
    expect(place(cell).classList.contains('is-magnified')).toBe(true)
  })

  it('goes back when the pointer moves to another, or off the grid', () => {
    renderApp()
    const [first, second] = cells()
    fireEvent.pointerOver(first)
    frame()
    fireEvent.pointerOver(second)
    frame()
    expect(place(first).classList.contains('is-magnified')).toBe(false)
    expect(place(second).classList.contains('is-magnified')).toBe(true)
    fireEvent.pointerLeave($('.phrase-grid')!)
    expect(place(second).classList.contains('is-magnified')).toBe(false)
  })

  // Grown with its place, it would stand over somewhere the pointer no longer
  // is. `e2e/click-through.spec.ts` drives the board pushed down under it.
  it('goes back when the board scrolls under it', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerOver(cell)
    frame()
    fireEvent.scroll($('.grid-wrapper')!)
    expect(place(cell).classList.contains('is-magnified')).toBe(false)
  })

  // Regression guard, from an iPad: grown from 85%, it was smaller than its
  // place for its first frames, and a pointer near its edge was off it.
  it('fades in at its full size, never smaller than the place it covers', () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const grow = css.match(/@keyframes magnify \{([\s\S]*?)\n\}/)![1]!
    expect(grow).not.toMatch(/scale|transform|width|height/)
    const lens = css.match(/\.phrase-place\.is-magnified > \.phrase-cell \{([^}]*)\}/)![1]!
    expect(lens).toMatch(/min-width: *calc\(100% \+/)
    expect(lens).toMatch(/min-height: *calc\(100% \+/)
  })

  it('is not for a finger, which hovers over nothing', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerOver(cell, { pointerType: 'touch' })
    frame()
    expect(place(cell).classList.contains('is-magnified')).toBe(false)
  })

  it('still says its phrase when rested on', () => {
    renderApp()
    const cell = plainCell()
    const text = cell.textContent
    fireEvent.pointerMove(document.body, { clientX: 5, clientY: 5 })
    fireEvent.pointerOver(cell)
    fireEvent.pointerEnter(cell)
    frame()
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.phraseDwellMs + 100))
    expect(spoken).toEqual([text])
  })

  it('cuts a phrase off at 15rem on one line, and wraps a magnified one at 30rem', () => {
    const css = stylesheet()
    const cell = css.match(/\n\.phrase-cell-text \{([^}]*)\}/)![1]
    expect(cell).toMatch(/max-width: 15rem;/)
    expect(cell).toMatch(/white-space: nowrap;/)
    expect(cell).toMatch(/text-overflow: ellipsis;/)
    const magnified = css.match(/\.phrase-place\.is-magnified \.phrase-cell-text \{([^}]*)\}/)![1]
    expect(magnified).toMatch(/max-width: 30rem;/)
    expect(magnified).toMatch(/white-space: normal;/)
  })
})
