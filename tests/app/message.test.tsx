// The message being built: the caret, the keys, the box that grows with what is in it, the controls on its borders, and what is said being kept in Library.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { setClipboardText, spoken } from '../setup'
import {
  $$,
  $,
  settle,
  click,
  renderApp,
  message,
  cells,
  speakToggle,
  plainCell,
  box,
  writeIn,
  iconBtn,
  writePhrase,
  clearMessage,
  slotCell,
  fillEverySlot,
} from './harness'
import { stylesheet } from '../stylesheet'
import { PLACE_AGAIN } from '../../src/ui/after-text'
import { forgetLastPress } from '../../src/ui/typing'

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
    // The box is focused when the board opens, so take that away first: the
    // claim is that a dwell puts it back, not that it was never there.
    composer().blur()
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
  // What the grid searches for is what was typed up to the caret.
  it('searches for what is typed up to where the caret was moved', () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'help zzzz' } })
    settle()
    expect(cells(), 'nothing says "help zzzz"').toHaveLength(0)

    answers(4) // just after "help"
    dwell(composer())
    expect(cells().length, 'the grid stayed on what the caret left').toBeGreaterThan(0)
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

/**
 * **What is said is kept in Library** — every message spoken or copied, as a
 * phrase in no category, unless Library says it already — and counted as used
 * the moment it is. There was a Sent tab for this; see
 * docs/decisions/sent-messages.md.
 */
describe('what is said', () => {
  const tabs = () => $$('.filter-tab[role="tab"]')
  const iconBtn = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
  const store = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}')
  const kept = (): string[] => (store().custom ?? []).map((c: { text: string }) => c.text)
  const usage = () => JSON.parse(localStorage.getItem('peri_usage') ?? '{}')
  const say = (text: string) => {
    writeIn(box(), text)
    click(iconBtn('Speak'))
    clearMessage()
    clearMessage()
  }
  const copied = async () => {
    click(iconBtn('Copy to clipboard'))
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  it('has no tab of its own: Translations and then Library lead the bar', () => {
    renderApp()
    expect(tabs()[0].textContent).toBe('Translations')
    expect(tabs()[1].textContent).toBe('Library')
    expect(tabs().map(el => el.textContent)).not.toContain('Sent')
  })

  it('keeps a message that was spoken in Library, in no category', () => {
    renderApp()
    say('Nobody has said this here before')

    expect(spoken).toEqual(['Nobody has said this here before'])
    expect(store().custom).toEqual([
      expect.objectContaining({ text: 'Nobody has said this here before', category: 'Library' }),
    ])
    expect(Object.values(store().members ?? {}).flat()).toEqual([])
  })

  /**
   * **And in the category whose tab is showing**, where Save would file it: a
   * sentence said on a tab is there on the tab afterwards. Regression guard —
   * it went into Library alone, and the tab it was said on never showed it.
   */
  describe('on a category of its own', () => {
    const seeded = { custom: [{ id: 'custom-seed-0', text: 'Toast and jam', category: 'Food' }] }
    const members = (): Record<string, string[]> => store().members ?? {}
    const keptId = (text: string) => store().custom.find((c: { text: string }) => c.text === text)?.id
    const goTo = (name: string) => click(tabs().find(t => t.textContent === name)!)
    beforeEach(() => localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify(seeded)))

    it('files a message spoken there under it, after what it had', () => {
      renderApp()
      goTo('Food')
      say('Something nobody has said')

      expect(members().Food).toEqual(['custom-seed-0', keptId('Something nobody has said')])
      expect(cells().map(c => c.textContent)).toContain('Something nobody has said')
    })

    it('files a message copied out there under it', async () => {
      renderApp()
      goTo('Food')
      writeIn(box(), 'Copied on the Food tab')
      await copied()
      expect(members().Food).toEqual(['custom-seed-0', keptId('Copied on the Food tab')])
    })

    // What typing finds comes from Library whichever tab is showing, so a
    // phrase found that way and said is not something the tab was asked to hold.
    it('files nothing Library says already', () => {
      renderApp()
      goTo('Food')
      say('Once in a blue moon')
      expect(kept()).toEqual(['Toast and jam'])
      expect(cells().map(c => c.textContent)).toEqual(['Toast and jam'])
    })

    it('files nothing on Library or a record', () => {
      renderApp()
      say('Said on Library')
      goTo('Translations')
      say('Said on Translations')
      expect(members()).toEqual({ Food: ['custom-seed-0'] })
      expect(kept()).toEqual(['Toast and jam', 'Said on Library', 'Said on Translations'])
    })
  })

  // Kept once the clipboard confirms it took it, so a copy that failed is not
  // kept as something that was said.
  it('keeps a message that was copied out', async () => {
    renderApp()
    writeIn(box(), 'Copied and never spoken')
    await copied()
    expect(kept()).toEqual(['Copied and never spoken'])
  })

  it('keeps nothing when the clipboard refuses', async () => {
    renderApp()
    ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    writeIn(box(), 'Refused by the clipboard')
    await copied()
    expect(kept()).toEqual([])
  })

  it('keeps nothing for an empty message', () => {
    renderApp()
    expect(iconBtn('Speak'), 'Speak is drawn with nothing to say').toBeUndefined()
    click(iconBtn('Copy to clipboard'))
    expect(kept()).toEqual([])
  })

  // Library holds each wording once.
  it('keeps a message said twice once', () => {
    renderApp()
    say('Twice over')
    say('twice   over ')
    expect(kept()).toEqual(['Twice over'])
  })

  // Choosing it off the board counted it, and it is in Library already.
  it('keeps nothing, and counts nothing again, for a phrase off the board said as it is', () => {
    renderApp()
    const cell = plainCell()
    const id = cell.getAttribute('data-phrase')!
    click(cell)
    click(iconBtn('Speak'))

    expect(kept()).toEqual([])
    expect(Object.keys(usage())).toEqual([id])
    expect(usage()[id].count).toBe(1)
  })

  it('keeps nothing for a phrase spoken off the board in auto-speak', () => {
    renderApp({ autoSpeak: true })
    click(plainCell())
    expect(spoken).toHaveLength(1)
    expect(kept()).toEqual([])
  })

  // **A phrase with its choices made is a repeat of that phrase**, not a new
  // one: kept as new, every combination anybody chose would be a phrase of its
  // own beside the one it came from. Choosing it counted the phrase it came
  // from, and nothing counts it again.
  it('keeps nothing for a phrase with its choices made, in auto-speak, and counts the phrase', () => {
    renderApp({ autoSpeak: true })
    const cell = slotCell()
    const id = cell.getAttribute('data-phrase')!
    click(cell)
    fillEverySlot()
    expect(spoken).toHaveLength(1)
    expect(kept(), 'a phrase with its choices made was kept as a new one').toEqual([])
    expect(Object.keys(usage())).toEqual([id])
    expect(usage()[id].count).toBe(1)
  })

  it('keeps nothing for a phrase with its choices made, spoken from the box', () => {
    renderApp()
    const cell = slotCell()
    const id = cell.getAttribute('data-phrase')!
    click(cell)
    expect(box().value).not.toBe('')
    click(iconBtn('Speak'))
    fillEverySlot()
    expect(spoken).toHaveLength(1)
    expect(kept(), 'a phrase with its choices made was kept as a new one').toEqual([])
    expect(usage()[id].count).toBe(1)
  })

  // Composed before it is said, as everything that speaks is: a blank in the
  // box is a gap, not two brackets read out.
  it('says a blank in the box as the gap it is', () => {
    renderApp()
    writeIn(box(), 'I need {} now')
    click(iconBtn('Speak'))
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toMatch(/^I need\s+now$/)
  })

  // More than the phrase is a message of its own.
  it('keeps a message that says more than a phrase with its choices made', () => {
    renderApp()
    click(slotCell())
    click(iconBtn('Speak'))
    fillEverySlot()
    const message = `${spoken[0]} and then some`
    writeIn(box(), message)
    click(iconBtn('Speak'))
    expect(kept()).toEqual([message])
  })

  /**
   * **Please is said, and only said.** The toggle beside paste puts ", please"
   * on the end of what comes out, and nothing else: what is kept in Library and
   * what is copied are the words as they were written. It is kept across a load.
   */
  describe('with please on', () => {
    const pleaseToggle = () => $('.please-toggle')!
    const settings = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}')

    it('says it after a message, and keeps the message without it', () => {
      renderApp()
      expect(pleaseToggle().getAttribute('aria-pressed')).toBe('false')
      click(pleaseToggle())
      expect(pleaseToggle().getAttribute('aria-pressed')).toBe('true')
      expect(settings().please).toBe(true)

      say('I would like some tea.')
      expect(spoken).toEqual(['I would like some tea, please'])
      expect(kept()).toEqual(['I would like some tea.'])

      click(pleaseToggle())
      say('Some toast')
      expect(spoken[1]).toBe('Some toast')
    })

    // And a phrase with its choices made is still the phrase it came from, said
    // with please or without.
    it('says it after a phrase off the board, and keeps nothing of a filled one', () => {
      renderApp({ autoSpeak: true, please: true })
      click(slotCell())
      fillEverySlot()
      expect(spoken[0]).toMatch(/, please[.!?]*$/)
      expect(kept()).toEqual([])
    })

    it('copies the words without it', async () => {
      renderApp({ please: true })
      writeIn(box(), 'Some soup')
      await copied()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Some soup')
      expect(kept()).toEqual(['Some soup'])
    })

    it('is still on after a load', () => {
      renderApp({ please: true })
      expect(pleaseToggle().getAttribute('aria-pressed')).toBe('true')
    })
  })

  // Counted as used the moment it is said, so it is first among what typing
  // finds, and first in Library under Recently used.
  it('is counted as used, so typing finds the latest first', () => {
    renderApp()
    say('Quokka one')
    act(() => void vi.advanceTimersByTime(1000))
    say('Quokka two')

    const ids = store().custom.map((c: { id: string }) => c.id)
    expect(Object.keys(usage()).sort()).toEqual([...ids].sort())

    writeIn(box(), 'quokka')
    expect(cells().map(c => c.textContent)).toEqual(['Quokka two', 'Quokka one'])
  })

  it('survives a reload, as any phrase does', () => {
    renderApp()
    say('Still here tomorrow')
    cleanup()
    renderApp()
    writeIn(box(), 'still here tom')
    expect(cells().map(c => c.textContent)).toEqual(['Still here tomorrow'])
  })

  /**
   * **A board from before kept a Sent list**, under a key of its own. It comes
   * into Library on the first look, oldest first so the phrases stand in the
   * order they were said, and the list goes — once, so opening the board again
   * brings nothing in twice.
   */
  // Nothing in it to bring in is still a list to take away.
  it('takes away a list from before that Library says all of already', () => {
    localStorage.setItem('peri_sent', JSON.stringify([{ id: 'sent-0', text: 'Yes, I can' }]))
    renderApp()
    expect(kept()).toEqual([])
    expect(localStorage.getItem('peri_sent')).toBeNull()
  })

  it('brings a Sent list from before into Library, once', () => {
    localStorage.setItem(
      'peri_sent',
      JSON.stringify([
        { id: 'sent-2', text: 'Said second' },
        { id: 'sent-1', text: 'Said first' },
        { id: 'sent-0', text: 'yes, I can' },
      ]),
    )
    renderApp()
    expect(kept()).toEqual(['Said first', 'Said second'])
    expect(localStorage.getItem('peri_sent')).toBeNull()

    cleanup()
    renderApp()
    expect(kept()).toEqual(['Said first', 'Said second'])
  })
})

// Synchronizing. The exchange itself is driven in `src/sync/use-sync.test.tsx`,
// against the real Netlify function; what is left for here is the wiring — that
// the row is in Settings, that it knows a guest is not an account, and that
// turning it on writes down what the next load needs.
/**
 * A pointer rests where it last fired, and whatever arrives underneath gets a
 * `pointerenter` of its own — so a control that appears under a resting pointer
 * starts dwelling on nobody's instruction. These two replace the whole screen.
 *
 * Driven by pointer rather than by `click`, which is the only way to see it: a
 * click goes straight to the activation and never arms anything.
 */
/**
 * The message box grows with what is in it.
 *
 * It was one line, fixed, with the overflow scrolled and the scrollbar hidden —
 * so a message longer than the box went above the fold and stayed there. Every
 * other surface here has dwell controls for scrolling; this one has none and
 * nothing to hang them on, so what scrolls out of it is gone.
 *
 * jsdom lays nothing out, so the measurement is supplied — the same bargain the
 * paging tests make. What is under test is what the app does with it.
 */
describe('the message box growing', () => {
  /** A box that reports one height while empty and another once it has text. */
  const measures = (empty: number, full: number) =>
    Object.defineProperty(box(), 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        // Read after the height has been cleared, which is the only way to
        // measure text that is already being given room for itself.
        return this.style.height === '' ? (this.value ? full : empty) : 999
      },
    })

  it('takes the height of the text in it', () => {
    renderApp()
    measures(56, 112)

    writePhrase('a message long enough to wrap onto a second line')
    expect(box().style.height).toBe('112px')
  })

  // Without clearing the height first the box only ever grows: `scrollHeight`
  // includes whatever room it is already being given.
  it('measures from one line rather than from its own height', () => {
    renderApp()
    measures(56, 112)

    writePhrase('two lines of message')
    expect(box().style.height).toBe('112px')
    writePhrase('')
    expect(box().style.height, 'the box kept the room it no longer needs').toBe('56px')
  })

  /**
   * **Room for its own border too.** The height is `border-box`, so a box set to
   * exactly what its text measures is two pixels short of holding it — enough
   * for the scroll arrows to appear on every message longer than a line, and
   * the room they take to rewrap it into one that really does overflow.
   */
  it('makes room for its own border', () => {
    renderApp()
    measures(56, 112)
    Object.defineProperty(box(), 'offsetHeight', { configurable: true, get: () => 58 })
    Object.defineProperty(box(), 'clientHeight', { configurable: true, get: () => 56 })

    writePhrase('two lines of message')
    expect(box().style.height).toBe('114px')
  })

  // The same fallback the grid's windowing makes: what cannot be measured is
  // left to the stylesheet, and a box set to nought is a box nobody can see.
  it('sets no height where nothing can be measured', () => {
    renderApp()
    writePhrase('a message')
    expect(box().style.height).toBe('')
  })

  // The board underneath is what somebody is speaking with. A message box that
  // ate it would be a box with nothing to put in it.
  it('is capped in the stylesheet, which is where the board is protected', () => {
    const css = stylesheet()
    const rule = css.slice(css.indexOf('.text-display {'))
    const box = rule.slice(0, rule.indexOf('}'))

    const declared = box.match(/max-height: *([^;]+);/)?.[1]
    expect(declared, 'the message box is not capped at all').toBeDefined()

    // The cap is a named number now, because the heard box beside it on a wide
    // screen is capped *against* it. So follow the reference: asserting the box
    // states the number itself would be a test that could only pass while it was
    // written down in two places, which is the thing the name exists to stop.
    const token = declared!.match(/var\((--[\w-]+)\)/)?.[1]
    const cap = token ? css.match(new RegExp(`${token}: *([^;]+);`))?.[1] : declared
    expect(cap, `${token} is asked for and never defined`).toBeDefined()

    expect(cap).toMatch(/^min\(/)
    // In `rem` and `dvh`: a cap in pixels stops growing at the one text size it
    // was written for, and `vh` on a phone is the viewport with the browser
    // chrome hidden.
    expect(cap).toMatch(/rem/)
    expect(cap).toMatch(/dvh/)
  })
})

/**
 * **The message box is a card**, the shape of a chat app's input box. On top, a
 * row: the clipboard at the far left, the modes centred, the language and the
 * voice at the right. Under it, the line the words are written on: the slot that
 * empties the box at its left end, then the box, with Speak **right after the
 * last word** — drawn only once there are words.
 */
describe('the card', () => {
  const labels = (sel: string) =>
    $$(`${sel} [role="button"], ${sel} button`).map(b => b.getAttribute('aria-label'))

  // The keyboard is offered only where it has been asked for — see *Peri's own
  // keyboard* — so on a board that has not asked, the menu is the whole rail.
  // **The menu is in the card**, last in its row of controls, at the upper
  // right — and only the keyboard, where it is offered, is outside it.
  it('leaves nothing outside it but the keyboard where it is offered, the menu last in its row', () => {
    renderApp()
    expect($$('.topbar > .icon-btn').map(b => b.getAttribute('aria-label'))).toEqual([])
    expect($('.message-wrap > .message-lines > .message-line'), 'the line is not inside the card').not.toBeNull()
    expect($('.message-wrap > .message-tools'), 'the row is not inside the card').not.toBeNull()
    const values = $('.message-tools > .tools-values')!
    expect(values.lastElementChild?.getAttribute('aria-label'), 'the menu is not last in the row').toBe(
      'Open menu',
    )
    expect(stylesheet()).toMatch(/\.icon-btn\.menu-btn \{[^}]*margin-left: 2\.5rem;/)

    renderApp({ keyboard: true })
    expect($$('.topbar > .icon-btn').map(b => b.getAttribute('aria-label'))).toEqual(['Show the keyboard'])
  })

  // The fit lays the copy out at the box's settled width and says so, and the
  // control after the words is placed again then — on a mode switch, which
  // narrows or widens the box without changing its words.
  it('asks for the control after the words to be placed again when the mode changes', () => {
    renderApp()
    writeIn(box(), 'Some words')
    let asked = 0
    $('.message-field > .after-text-mirror')!.addEventListener(PLACE_AGAIN, () => asked++)
    click(speakToggle())
    expect(asked, 'nothing asked for it to be placed again').toBeGreaterThan(0)
  })

  // The row above, and under it the lines — the message's, and the question's
  // before it while listen mode is open (`app/listen.test.tsx`).
  it('puts the row above the line, and the line under it', () => {
    renderApp()
    expect([...$('.message-wrap')!.children].map(el => el.className.split(' ')[0])).toEqual([
      'message-tools',
      'message-lines',
    ])
    expect([...$('.message-lines')!.children].map(el => el.className.split(' ')[0])).toEqual(['message-line'])
  })

  // Where the words end is the browser's to say — `e2e/layout.spec.ts` holds
  // Speak to it. What jsdom can see is that it stands in the box, after the
  // words, and only once there are some.
  it('puts clear at the left end of the line, and speak after the words once there are some', () => {
    renderApp()
    const line = () => [...$('.message-line')!.children].map(el => el.className.split(' ')[0])
    expect(line()).toEqual(['topbar-clear', 'message-field'])
    expect(labels('.message-line > .topbar-clear')).toEqual(['Clear'])
    expect(labels('.message-field > .after-text'), 'Speak is drawn with nothing to say').toEqual([])

    writeIn(box(), 'Hello')
    expect(labels('.message-field > .after-text')).toEqual(['Speak'])
    expect(iconBtn('Speak')!.classList.contains('is-primary')).toBe(true)
    // The never-seen copy it is placed by holds the same words.
    expect($('.message-field > .after-text-mirror')!.textContent).toBe('Hello')

    click(iconBtn('Clear'))
    expect(labels('.message-line > .topbar-clear')).toEqual(['Undo'])
    expect(labels('.message-field > .after-text')).toEqual([])
  })

  // The microphone comes first among the modes where the browser can listen —
  // see `app/listen.test.tsx`; this one cannot.
  it('puts the clipboard at the far left of the row, the modes in its middle, and the values at its right', () => {
    renderApp()
    const row = () => [...$('.message-tools')!.children].map(el => el.className.split(' ')[0])
    // And Rest, the open space behind them — see `RestSurface`.
    expect(row()).toEqual(['tools-left', 'tools-modes', 'tools-values', 'rest-surface'])
    expect(labels('.tools-clipboard')).toEqual(['Copy to clipboard', 'Paste from clipboard'])
    // Undo and Redo for the board after them, quiet with nothing to reach.
    expect(labels('.tools-left')).toEqual([
      'Copy to clipboard',
      'Paste from clipboard',
      'Nothing to undo',
      'Nothing to redo',
    ])
    // Auto-speak, whose off is edit mode. Please after it: it is about how
    // what is said comes out. Present last, being about where it goes.
    expect(labels('.tools-modes')).toEqual([
      'Turn off auto-speak — edit phrases',
      'Say please at the end of everything spoken',
      'Present: show what is said in a window of its own',
    ])
  })

  /**
   * **The same places in edit mode**, meaning what the mode says: start a new
   * phrase where clear was, Save where Speak was — drawn once there are words —
   * paste where it was. **No delete among them**: the bin is on the phrase
   * open in the box, as it is on the tab showing.
   */
  it('keeps its places in edit mode, with nothing beside the words', () => {
    renderApp()
    click(speakToggle())
    expect(labels('.message-line > .topbar-clear')).toEqual(['Start a new phrase'])
    expect(labels('.message-field > .after-text')).toEqual([])
    writePhrase('Something new')
    // Save where it always stood, and Speak after it, which saves as well.
    expect(labels('.message-field > .after-text')).toEqual(['Save phrase', 'Speak and save'])

    expect(labels('.tools-left')).toEqual(['Paste from clipboard', 'Nothing to undo', 'Nothing to redo'])
    expect(labels('.tools-values')).toEqual([
      expect.stringMatching(/^Language this phrase's voice is for/),
      expect.stringMatching(/^Voice for this phrase/),
      'Open menu',
    ])
    expect(iconBtn('Delete phrase')).toBeUndefined()
    // **Nothing beside the words** — words already on the board are said in a
    // toast — so the line is the slot that empties it and the box.
    const line = () => [...$('.message-line')!.children].map(el => el.className.split(' ')[0])
    expect(line()).toEqual(['topbar-clear', 'message-field'])
    click(iconBtn('Start a new phrase'))
    writePhrase(plainCell().textContent!)
    expect(line()).toEqual(['topbar-clear', 'message-field'])
  })

  /**
   * **The modes are centred**: the row is three columns, the middle one between
   * two equal ones, and stacks by the card's own width rather than the
   * screen's. Asserted against the stylesheet, which is all jsdom allows —
   * where it lands is `e2e/layout.spec.ts`'s question.
   */
  it('centres the modes between two equal columns, stacking by the card’s width', () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const block = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      return rule.slice(0, rule.indexOf('}'))
    }
    expect(block('.message-tools')).toMatch(/grid-template-columns: *1fr auto 1fr/)
    expect(block('.tools-modes')).toMatch(/justify-self: *center/)
    expect(block('.message-wrap')).toMatch(/container: *message \/ inline-size/)
    expect(css).toMatch(/@container message \(max-width: [\d.]+rem\)/)
  })

  /**
   * Its look, asserted against the text of the stylesheet, which is all jsdom
   * allows — whether it looks right is `e2e/layout.spec.ts`'s question and an
   * eye's. **No ground or edge round the row and the box**: the box has the
   * ground, and says focus with a line along its foot.
   */
  it('grounds the box, and nothing round it', () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const block = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      return rule.slice(0, rule.indexOf('}'))
    }
    const value = (selector: string, prop: string) =>
      block(selector).match(new RegExp(`\\b${prop}: *([^;]+);`))?.[1]

    expect(value('.message-wrap', 'background'), 'a ground round the message').toBeUndefined()
    expect(value('.message-wrap', 'border'), 'an edge round the message').toBeUndefined()
    expect(value('.heard-wrap', 'background'), 'a ground round the question').toBeUndefined()
    expect(value('.heard-wrap', 'border'), 'an edge round the question').toBeUndefined()
    expect(value('.text-display', 'background')).toBe('var(--card-ground)')
    expect(value('.text-display', 'border')).toBe('none')
    expect(css).not.toMatch(/\.message-wrap:focus-within/)

    // Every control in either card is the microphone's size, and draws its glyph at the microphone's.
    const mic = { box: value('.mode-btn', 'height'), glyph: value('.mode-btn svg', 'height') }
    expect(value('.icon-btn.in-card', 'height')).toBe(mic.box)
    expect(value('.icon-btn.in-card svg', 'height')).toBe(mic.glyph)
    expect(value('.heard-btn svg', 'height')).toBe(mic.glyph)
    expect(block('.icon-btn.in-card.is-primary'), 'speak is filled, as a chat app fills send').toMatch(
      /background: *var\(--accent\)/,
    )
    expect(block('.heard-btn.is-primary'), 'ask is not filled as speak is').toMatch(/background: *var\(--accent\)/)
    // The menu is a bare glyph: no ground or edge of its own.
    expect(block('.icon-btn.menu-btn')).toMatch(/background: *transparent/)
    expect(block('.icon-btn.menu-btn')).toMatch(/border-color: *transparent/)
    // The bin with nothing to delete keeps its place, unseen.
    expect(block('.icon-btn.in-card.is-absent')).toMatch(/visibility: *hidden/)
    // Clear's X in a red of its own, the danger red let down towards the grey.
    expect(block('svg.clear-x')).toMatch(/color: *var\(--clear-red\)/)
    expect(css).toMatch(/--clear-red: *color-mix\(in srgb, *var\(--danger\)/)
    // The language and the voice have no ground of their own; the card's shows through.
    expect(block('.choice-btn'), 'the language and the voice have a ground').toMatch(/background: *transparent/)
  })

  // It means two things and sits in one place, which is what makes the mode a
  // change of meaning rather than a change of layout.
  it('keeps the slot that empties the box in its place in edit mode, where it starts a new phrase instead', () => {
    renderApp()
    expect(iconBtn('Clear')!.closest('.topbar-clear')).not.toBeNull()
    const clearX = iconBtn('Clear')!.querySelector('svg')!.outerHTML
    expect(iconBtn('Start a new phrase'), 'the phrase controls are showing already').toBeUndefined()

    click(speakToggle())
    expect(iconBtn('Clear'), 'the message controls are still showing').toBeUndefined()
    expect(iconBtn('Start a new phrase')!.closest('.topbar-clear')).not.toBeNull()
    // **The same X as Clear**: it empties the box here too, so it looks it.
    expect(
      iconBtn('Start a new phrase')!.querySelector('svg')!.outerHTML,
      'starting a new phrase draws a different icon from Clear',
    ).toBe(clearX)
  })
})

// The keyboard route into a text box is Ctrl-V, which is exactly the input this
// app exists without — so both boxes offer a control that asks on the user's
// behalf. It can be refused, and for a gaze user refusal is the likely case.
describe('pasting by dwell', () => {
  const iconBtn = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
  const composer = () => $<HTMLTextAreaElement>('.text-display')!
  const toast = () => $('.toast')?.textContent ?? $('.toast-region')?.textContent ?? ''
  const settleAsync = async () => {
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(50)
    })
  }

  // Never disabled: what is on the clipboard is not this app's to know until it
  // asks, so a paste with nothing behind it says so rather than being greyed out.
  it('stays live with an empty message, unlike speak and copy', () => {
    renderApp()
    expect(iconBtn('Speak'), 'Speak is drawn with nothing to say').toBeUndefined()
    expect(iconBtn('Copy to clipboard')?.hasAttribute('disabled')).toBe(true)
    expect(iconBtn('Paste from clipboard')?.hasAttribute('disabled')).toBe(false)
  })

  it('puts the clipboard into the message box', async () => {
    renderApp()
    setClipboardText('from the clipboard')
    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(composer().value).toBe('from the clipboard')
  })

  // The same conversion a Ctrl-V gets: a bare address on an AAC board is a whole
  // row of characters and forty seconds of punctuation read aloud.
  it('turns a pasted address into the name of the page', async () => {
    renderApp()
    setClipboardText('https://example.com/menu')
    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(composer().value).toBe('[example.com](https://example.com/menu)')
  })

  // Lands at the caret, not at the end. The caret has to be moved off the end
  // first or the two answers are the same: `fireEvent.change` leaves it there,
  // which is what made an earlier version of this test pass either way.
  it('lands where the caret is rather than at the end', async () => {
    renderApp()
    fireEvent.change(composer(), { target: { value: 'look at' } })
    composer().setSelectionRange(4, 4) // "look| at"
    setClipboardText('this')
    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(composer().value).toBe('look this at')
  })

  // Reading the clipboard needs permission and, in most browsers, a recent click
  // or key press — and a dwell has no press in it. Saying nothing would leave the
  // control looking broken to exactly the people it is for.
  it('says so out loud when the browser refuses', async () => {
    renderApp()
    const readText = navigator.clipboard.readText as ReturnType<typeof vi.fn>
    readText.mockRejectedValueOnce(new Error('denied'))

    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(toast()).toMatch(/blocked/i)
    expect(composer().value).toBe('')
  })

  it('says so when there is nothing on the clipboard', async () => {
    renderApp()
    setClipboardText('')
    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(toast()).toMatch(/nothing on the clipboard/i)
  })

  // The same control, in the same place, doing the same thing to whichever of
  // the two the box is holding — there is one box now, and one paste.
  it('offers the same while a phrase is being written', async () => {
    renderApp()
    click($('.autospeak-toggle'))
    click(plainCell())
    fireEvent.change(box(), { target: { value: 'I want' } })

    setClipboardText('a drink')
    click(iconBtn('Paste from clipboard'))
    await settleAsync()

    expect(box().value).toBe('I want a drink')
  })
})

/**
 * Peri's own keyboard, in the app it has to serve.
 *
 * It exists for a device where the pointer only hovers: iOS raises its software
 * keyboard on a gesture and presses its keys with taps, and there is neither.
 * Without this there is no way to type a word anywhere in the app — so what is
 * held here is the wiring, and above all that it outlasts a panel opening over
 * the board. The fields in Aliases need it as much as the message does, and the
 * control that opens it is behind that panel.
 */
/**
 * **Offered only where it has been asked for**, which is what `keyboard: true`
 * is doing in every render here: it is the one way to type at all on iOS, and a
 * target in the way on a device with a real keyboard.
 */
describe('the keyboard Peri draws', () => {
  const keyboard = () => document.querySelector('.keyboard')
  const openSettings = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
  }
  const panelBtn = (label: string) =>
    [...document.body.querySelectorAll('.panel-btn')].find(b => b.getAttribute('aria-label') === label)
  const keyNamed = (name: string) =>
    [...document.querySelectorAll('.key')].find(k => k.getAttribute('aria-label') === name)!
  const toggleKeyboard = () => click(iconBtn('Show the keyboard') ?? iconBtn('Hide the keyboard'))

  it('is not there until it is asked for', () => {
    renderApp({ keyboard: true })
    expect(keyboard()).toBeNull()
  })

  // Four rows of keys and no way to put them down is what taking the setting
  // away would otherwise leave on the screen.
  it('goes away with the setting that offered it', () => {
    renderApp({ keyboard: true })
    toggleKeyboard()
    expect(keyboard()).not.toBeNull()

    openSettings()
    click(panelBtn('Take it away'))

    expect(keyboard(), 'the keys are still up with nothing to close them').toBeNull()
  })

  // The setting is what puts the toggle in the rail at all.
  it('is not offered at all on a board that has not asked for it', () => {
    renderApp()
    expect(iconBtn('Show the keyboard'), 'the toggle is there on a board that never asked').toBeUndefined()
    expect(keyboard()).toBeNull()
  })

  it('comes up on the toggle beside the menu, and goes away again', () => {
    renderApp({ keyboard: true })
    toggleKeyboard()
    expect(keyboard()).not.toBeNull()

    toggleKeyboard()
    expect(keyboard()).toBeNull()
  })

  /**
   * Reading the box back would prove only that a letter reached the DOM node.
   * What has to be true is that it reached the app — so the message is spoken,
   * which can only say what the composer's own state holds.
   */
  it('types into the message box, and the app hears it', () => {
    renderApp({ keyboard: true })
    act(() => box().focus())
    toggleKeyboard()

    click(keyNamed('h'))
    click(keyNamed('i'))
    expect(message()).toBe('hi')

    click(iconBtn('Speak'))
    expect(spoken, 'the letters never reached the composer').toContain('hi')
  })

  it('closes from its own key', () => {
    renderApp({ keyboard: true })
    toggleKeyboard()
    click(keyNamed('Close the keyboard'))
    expect(keyboard()).toBeNull()
  })

  /**
   * The architectural claim. A panel covers the whole viewport and the toggle
   * with it, so a keyboard that lived on the board would be unreachable exactly
   * where half the app's text fields are.
   */
  it('stays up when a panel opens over the board', () => {
    renderApp({ keyboard: true })
    toggleKeyboard()
    click(iconBtn('Open menu'))
    expect(keyboard(), 'the keyboard went away with the board behind it').not.toBeNull()
  })

  /**
   * The reason the keyboard is kept as short as it is.
   *
   * Typing here is not mainly for writing sentences out — it is for reaching a
   * phrase in three letters. So the board narrowing as the keys are pressed is
   * the feature, and a keyboard that left no board would leave nothing to
   * narrow.
   */
  it('narrows the board to what is being typed', () => {
    renderApp({ keyboard: true })
    act(() => box().focus())
    toggleKeyboard()
    const before = cells().length

    click(keyNamed('h'))
    click(keyNamed('e'))
    click(keyNamed('l'))

    expect(cells().length, 'the board did not narrow to what was typed').toBeLessThan(before)
    expect(cells()[0].textContent?.toLowerCase()).toContain('hel')
  })

  // Auto-speak is where the board ships, so this is what somebody opening Peri
  // for the first time and typing actually gets.
  it('narrows in auto-speak too, which is where the board opens', () => {
    renderApp({ autoSpeak: true, keyboard: true })
    act(() => box().focus())
    toggleKeyboard()
    const before = cells().length

    click(keyNamed('h'))
    click(keyNamed('e'))
    click(keyNamed('l'))
    expect(cells().length).toBeLessThan(before)
  })

  // And in edit mode too, where the box holds a phrase being written: the board
  // is searched as it is typed, by the same rule.
  it('narrows the board while a phrase is being written, too', () => {
    renderApp({ keyboard: true })
    click(speakToggle())
    act(() => box().focus())
    toggleKeyboard()
    const before = cells().length

    click(keyNamed('h'))
    click(keyNamed('e'))
    click(keyNamed('l'))
    expect(cells().length, 'typing a phrase did not search the board').toBeLessThan(before)
  })

  // The bar somebody reaches for without reading it must not be the one the
  // keyboard covers, so the app gives up the height rather than overlapping.
  it('makes room for itself rather than covering the emergency bar', () => {
    renderApp({ keyboard: true })
    toggleKeyboard()
    expect($('.app')?.classList.contains('has-keyboard')).toBe(true)
    expect($('.emergency-bar')).not.toBeNull()
  })
})

/**
 * Building a sentence out of phrases from more than one category — the whole
 * of what composing is for.
 *
 * Choosing a phrase used to leave the caret against its last word, which the
 * board then read as a word being typed: it narrowed the grid to that word and
 * took the category bar away, and the next phrase chosen replaced the word as
 * if finishing it. So "Once in a blue moon" followed by "Thank you" became
 * "Once in a blue Thank you".
 */
describe('choosing one phrase after another', () => {
  const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
  const cellFor = (text: string) => cells().find(c => c.textContent === text)
  /**
   * What a search found, without the phrase open in the box — which in edit
   * mode stays on the board, first, once it is being changed: its cell carries
   * its bin.
   */
  const found = () =>
    cells()
      .filter(c => !c.querySelector('.cell-tools'))
      .map(c => c.textContent)

  const seeded = (editing = true) => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [
          { id: 'custom-moon', text: 'Once in a blue moon', category: 'Sayings' },
          { id: 'custom-moonlight', text: 'Moonlight becomes you', category: 'Sayings' },
          { id: 'custom-thanks', text: 'Thank you', category: 'Manners' },
          { id: 'custom-tell', text: 'Tell {} I said hello', category: 'Messages' },
        ],
      }),
    )
    renderApp()
    // Building a sentence out of phrases is what edit mode's box does: the
    // first phrase into an empty box opens, and each one after goes in at the
    // caret.
    if (editing) click(speakToggle())
    click(tab('Sayings'))
  }
  /** Written into the box as a person types it, caret at the end. */
  const typeInto = (value: string) => {
    fireEvent.change(box(), { target: { value, selectionStart: value.length } })
    fireEvent.select(box(), { target: { selectionStart: value.length, selectionEnd: value.length } })
    settle()
  }

  it('keeps the category tabs after a phrase is chosen', () => {
    seeded()

    click(cellFor('Once in a blue moon'))

    expect(message()).toBe('Once in a blue moon')
    expect(tab('Manners'), 'the tabs went with the phrase').toBeDefined()
    // And the whole tab, not the phrases matching its last word.
    expect(cells().map(c => c.textContent)).toEqual(['Once in a blue moon', 'Moonlight becomes you'])
  })

  it('reaches a second category for the next phrase', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    typeInto(`${message()} `)

    click(tab('Manners'))
    click(cellFor('Thank you'))

    expect(message()).toBe('Once in a blue moon Thank you')
  })

  /**
   * Regression guard. The last word of a phrase just chosen was read as a word
   * being typed, so the next phrase chosen replaced it as if finishing it —
   * "Once in a blue moon" and then "Moonlight becomes you" came out as "Once in
   * a blue Moonlight becomes you".
   */
  it('never writes over the last word of the phrase before', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    typeInto(`${message()} `)

    click(cellFor('Moonlight becomes you'))

    expect(message()).toBe('Once in a blue moon Moonlight becomes you')
  })

  // Clear and then Undo put the message back as it was — phrase and all, not a
  // phrase whose last word the board now reads as typed. Said, in auto-speak,
  // where the box is the message and Clear and Undo are its own.
  it('keeps a phrase whole after the message is cleared and put back', () => {
    seeded(false)
    click(cellFor('Once in a blue moon'))
    click(iconBtn('Clear'))
    click(iconBtn('Undo'))
    expect(message()).toBe('Once in a blue moon')

    expect(tab('Manners'), 'the phrase put back was read as typing').toBeDefined()
    expect(cells().map(c => c.textContent)).toEqual(['Once in a blue moon', 'Moonlight becomes you'])
  })

  // A gap is where the caret goes, but the phrase still ends where it ends:
  // the caret taken there without typing is still against a phrase.
  it('keeps a phrase with a gap whole when the caret is taken to its end', () => {
    seeded()
    click(tab('Messages'))
    click(cells().find(c => c.textContent?.includes('I said hello')))
    // Changed, so the board can be chosen from again — a space after it, and
    // the caret then taken to the phrase's own end rather than after the space.
    typeInto(`${message()} `)
    const end = message().length - 1
    fireEvent.select(box(), { target: { selectionStart: end, selectionEnd: end } })
    settle()

    click(tab('Sayings'))
    click(cellFor('Moonlight becomes you'))

    expect(message()).toBe('Tell {} I said hello Moonlight becomes you ')
  })

  // Taking the last letter off a phrase and typing it back is typing a word,
  // wherever the caret ends up.
  it('narrows to a word typed back over the end of a phrase', () => {
    seeded()
    click(cellFor('Once in a blue moon'))

    typeInto('Once in a blue moo')
    typeInto('Once in a blue moon')

    expect(tab('Manners'), 'a typed word was read as a phrase').toBeUndefined()
    // The whole word, not the one letter typed back.
    expect(cells().map(c => c.textContent)).toContain('Moonlight becomes you')
    expect(
      cells().map(c => c.textContent),
      'searched for the letter alone',
    ).not.toContain('No way!')
  })

  /**
   * Regression guard, found in a browser. A box without focus does not keep its
   * caret: Chrome put it back to the start when a category tab was rested on,
   * with no event and no call on the box — and the next phrase went in before
   * the one before it. Done here the way Chrome does it: the node's caret moved
   * and nothing told.
   */
  it('adds the next phrase at the end when the box has lost its caret', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    // Changed, so the board can be chosen from again — see `choosing` in talk.tsx.
    typeInto(`${message()} `)
    click(tab('Manners'))
    // Back at the start, silently; what the app sets afterwards still sticks.
    const node = box()
    const caret = { selectionStart: 0, selectionEnd: 0 }
    for (const edge of ['selectionStart', 'selectionEnd'] as const) {
      Object.defineProperty(node, edge, {
        configurable: true,
        get: () => caret[edge],
        set: (at: number) => void (caret[edge] = at),
      })
    }

    click(cellFor('Thank you'))

    expect(message()).toBe('Once in a blue moon Thank you')
  })

  // **Focus is put back in the box when it falls to nothing — with the caret
  // the message says it had**, not the one Chrome left on an unfocused box.
  it('puts focus back in the box, at its own caret, when focus falls to nothing', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    const node = box()
    const placed = vi.spyOn(node, 'setSelectionRange')
    act(() => node.blur())
    act(() => void vi.advanceTimersByTime(10))
    expect(document.activeElement, 'focus was left on nothing').toBe(node)
    expect(placed).toHaveBeenLastCalledWith(message().length, message().length)
  })

  // A phrase is finished; a word somebody types is not. Typing after one is
  // typing a new word, and the board narrows to it again.
  it('narrows again to a word typed after it', () => {
    seeded()
    click(cellFor('Once in a blue moon'))

    typeInto('Once in a blue moon moonl')

    expect(found()).toEqual(['Moonlight becomes you'])
    // The phrase open in the box first, with its bin, and not to be chosen.
    expect(cells()[0].textContent).toBe('Once in a blue moon')
    expect(cells()[0].querySelector('.delete-tool')).not.toBeNull()
    expect(tab('Manners'), 'the tabs stayed over a narrowed board').toBeUndefined()
  })

  // What is searched is everything typed since the phrase, spaces and all, and
  // choosing a phrase replaces the whole of it rather than its last word.
  it('replaces several typed words as a whole', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    typeInto('Once in a blue moon moonlight bec')
    expect(found()).toEqual(['Moonlight becomes you'])

    click(cellFor('Moonlight becomes you'))

    expect(message()).toBe('Once in a blue moon Moonlight becomes you')
  })

  it('replaces the whole box when nothing was chosen first', () => {
    seeded()
    typeInto('  MOONLIGHT  becomes ')
    click(cellFor('Moonlight becomes you'))
    expect(message()).toBe('Moonlight becomes you')
  })

  /**
   * Regression guard, found in a browser. Chrome takes a key press ahead of a
   * timer, so a phrase chosen and typed after at once had the letters arrive
   * before the caret was put at the end of the phrase — which then put it back,
   * behind them, and the next phrase went in there. Typed here before the timer
   * has run.
   */
  it('leaves the caret where typing put it when the typing came first', () => {
    seeded()
    fireEvent.pointerMove(document.body, { clientX: 900, clientY: 300 })
    fireEvent.click(cellFor('Once in a blue moon')!)
    typeInto('Once in a blue moon moonl')

    expect(found()).toEqual(['Moonlight becomes you'])
  })

  // Cleared, the phrase is gone with the words: what is typed next is all new.
  it('searches everything typed after the box is cleared', () => {
    seeded(false)
    click(cellFor('Once in a blue moon'))
    clearMessage()
    typeInto('Once in a blue moon moonl')

    expect(cells().map(c => c.textContent)).not.toContain('Moonlight becomes you')
  })

  // And finishing that word is still finishing it.
  it('finishes a word typed after it', () => {
    seeded()
    click(cellFor('Once in a blue moon'))
    typeInto('Once in a blue moon moonl')

    click(cellFor('Moonlight becomes you'))

    expect(message()).toBe('Once in a blue moon Moonlight becomes you')
  })
})

/**
 * **The keys a keyboard says most**, in the message box: Enter does what the
 * primary does — Speak, or Save in edit mode — and Escape what the slot at the
 * line's left end does, emptying the box. Enter with any modifier is a new
 * line, which a textarea gives Shift alone.
 */
describe('Enter and Escape in the message box', () => {
  const press = (
    key: string,
    mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {},
  ) => {
    fireEvent.keyDown(box(), { key, ...mods })
    settle()
  }
  const writeAtEnd = (value: string) => {
    writeIn(box(), value)
    act(() => box().setSelectionRange(value.length, value.length))
  }

  it('speaks on Enter, and does nothing with an empty box', () => {
    renderApp()
    press('Enter')
    expect(spoken).toEqual([])

    writeAtEnd('Hello there')
    press('Enter')
    expect(spoken.at(-1)).toBe('Hello there')
  })

  it('clears on Escape, which Undo puts back', () => {
    renderApp()
    writeAtEnd('Hello there')
    press('Escape')
    expect(message()).toBe('')
    expect(spoken, 'Escape said something').toEqual([])

    click(iconBtn('Undo'))
    expect(message()).toBe('Hello there')
  })

  it.each([['shiftKey'], ['altKey'], ['ctrlKey'], ['metaKey']] as const)(
    'puts in a new line on Enter with %s held, and says nothing',
    mod => {
      renderApp()
      writeAtEnd('Line one')
      press('Enter', { [mod]: true })
      expect(message()).toBe('Line one\n')
      expect(spoken).toEqual([])
    },
  )

  it('saves on Enter in edit mode, and starts a new phrase on Escape', () => {
    renderApp()
    click(speakToggle())
    writeAtEnd('A phrase of my very own')
    press('Enter')
    expect($('.toast')?.textContent).toMatch(/^Added to Library/)
    expect(cells().some(c => c.textContent === 'A phrase of my very own')).toBe(true)
    expect(spoken, 'Enter in edit mode spoke').toEqual([])

    writeAtEnd('Another one')
    press('Escape')
    expect(message()).toBe('')
    expect(
      cells().some(c => c.textContent === 'Another one'),
      'Escape saved it',
    ).toBe(false)
  })

  it('puts in a new line on a modified Enter in edit mode, and saves nothing', () => {
    renderApp()
    click(speakToggle())
    writeAtEnd('First line')
    press('Enter', { ctrlKey: true })
    expect(message()).toBe('First line\n')
    expect(cells().some(c => c.textContent?.startsWith('First line'))).toBe(false)
  })
})

/**
 * **A finger, with Peri's own keyboard off, leaves the box alone.** A box
 * taking focus from a tap is what raises a phone's keyboard, and on Android it
 * came up after every tap on the board. So a finger's press lets focus go, and
 * nothing puts it back — the words still land in the box; tapping the box
 * brings the caret and the keyboard. A mouse, a head mouse and Peri's own
 * keyboard keep the caret in the box as ever.
 */
describe('on a touch screen', () => {
  afterEach(() => forgetLastPress())
  /** A finger on something, as Android sends one: the press, then the click. */
  const tap = (el: Element) => {
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    const kept = !fireEvent.mouseDown(el)
    // jsdom moves no focus on a press; the browser does, where nothing stops it.
    if (!kept) act(() => (document.activeElement as HTMLElement | null)?.blur())
    fireEvent.click(el)
    act(() => void vi.advanceTimersByTime(50))
    return kept
  }

  it('lets focus go from the box on a tap, and puts nothing back', () => {
    renderApp()
    const cell = plainCell()
    const text = cell.textContent
    expect(tap(cell), 'the press held focus in the box').toBe(false)
    expect(document.activeElement, 'the box took focus back').not.toBe(box())
    // The words are in the box all the same.
    expect(message()).toBe(text)
  })

  it('keeps the caret in the box for a mouse', () => {
    renderApp()
    const cell = plainCell()
    fireEvent.pointerDown(cell, { pointerType: 'mouse' })
    expect(fireEvent.mouseDown(cell), 'a mouse press took focus').toBe(false)
    act(() => box().blur())
    act(() => void vi.advanceTimersByTime(10))
    expect(document.activeElement).toBe(box())
  })

  // Peri's own keyboard types into whatever has the caret, so it stays.
  it("keeps the caret in the box with Peri's own keyboard on", () => {
    renderApp({ keyboard: true })
    expect(tap(plainCell()), 'the press let focus go').toBe(true)
    act(() => box().blur())
    act(() => void vi.advanceTimersByTime(10))
    expect(document.activeElement).toBe(box())
  })
})

/**
 * **The system keyboard only when asked for**: a click, a tap or a dwell in
 * the box. Until then the box wants none (`inputMode="none"`) and keeps its
 * caret all the same, so a hardware keyboard and Peri's own still type into
 * it; a press or a dwell anywhere else puts it away again.
 */
describe('the system keyboard', () => {
  afterEach(() => forgetLastPress())
  const mode = () => box().getAttribute('inputmode')

  it('is wanted by nothing as the board opens, though the box has the caret', () => {
    renderApp()
    expect(document.activeElement).toBe(box())
    expect(mode()).toBe('none')
  })

  it('is asked for by a press in the box, and put away by a press anywhere else', () => {
    renderApp()
    fireEvent.pointerDown(box())
    expect(mode(), 'a press in the box did not ask for it').toBeNull()
    settle()
    expect(mode()).toBeNull()

    fireEvent.pointerDown(plainCell())
    settle()
    expect(mode(), 'a press on the board left it up').toBe('none')
    // Put away with the caret still in the box, for whatever else types there.
    expect(document.activeElement).toBe(box())
  })

  it('is asked for by a dwell in the box, and put away by a dwell anywhere else', () => {
    renderApp({ actionDwellMs: 800, phraseDwellMs: 1000 })
    fireEvent.pointerMove(document.body, { clientX: 5, clientY: 5 })
    fireEvent.pointerEnter(box(), { clientX: 40, clientY: 10 })
    act(() => void vi.advanceTimersByTime(850))
    settle()
    expect(mode(), 'a dwell in the box did not ask for it').toBeNull()
    fireEvent.pointerLeave(box())

    const cell = plainCell()
    fireEvent.pointerMove(document.body, { clientX: 400, clientY: 400 })
    fireEvent.pointerEnter(cell)
    act(() => void vi.advanceTimersByTime(1100))
    settle()
    expect(mode(), 'a dwell on the board left it up').toBe('none')
  })
})
