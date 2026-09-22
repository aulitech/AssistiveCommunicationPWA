// The message being built: the caret, the keys, the box that grows with what is in it, the controls on its borders, and the list of what has been said.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setClipboardText, spoken } from '../setup'
import {
  $$,
  $,
  settle,
  click,
  renderApp,
  message,
  cells,
  editToggle,
  plainCell,
  box,
  iconBtn,
  writePhrase,
  editTitle,
  clearMessage,
} from './harness'

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
    expect(
      tabs()
        .map(el => el.textContent)
        .slice(0, 2),
    ).toEqual(['Sent', 'All'])
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
    const [first, second] = cells()
      .filter(c => !c.querySelector('.phrase-slot'))
      .slice(0, 2)
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
    const [first, second] = cells()
      .filter(c => !c.querySelector('.phrase-slot'))
      .slice(0, 2)
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

      expect(editTitle()).toMatch(/keep this message/i)
      expect(iconBtn('Keep this message as a phrase')).toBeDefined()
      expect(iconBtn('Forget this message')).toBeDefined()
      // It must not offer to file it under "Sent", which is not a real category.
      expect($('.category-trigger')?.textContent).not.toMatch(/Sent/)
      expect(said).not.toBe('')
    })

    it('keeps it as a phrase of its own, leaving the record alone', () => {
      renderApp()
      const said = sendOne()
      click(tabNamed('Sent'))
      enterEditMode()
      click(cells()[0])
      click(iconBtn('Keep this message as a phrase'))

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
      click(iconBtn('Forget this message'))

      expect(stored()).toEqual([])
      expect(cells()).toHaveLength(0)
    })
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
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
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
 * The slot that empties the box rides the **message box's** lower border.
 *
 * It was a full-size button in the rail beside the box, and moving it onto a
 * border is the bargain the mode strip already struck on the upper one: the board
 * gets the width back, and what it costs is a smaller painted control overlapping
 * the box with an invisible area around it a tracker can still hit.
 */
/**
 * **The modes never sit left of the message box.** They are centred on the bar,
 * where Rest is looked for without looking; with the question beside the answer
 * on a wide screen, the bar's centre is over the gap between the two boxes and
 * edit sat on nothing. The stylesheet takes whichever is further right of the
 * bar's centre and the place that puts the strip's left edge on the box's, and
 * the bar measures the two numbers that second place needs.
 *
 * jsdom lays nothing out, so the geometry is supplied — the bargain the paging
 * tests make. What is under test is what the app does with it.
 */
describe('the mode strip', () => {
  const rule = () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const at = css.slice(css.indexOf('.topbar-modes {'))
    return at.slice(0, at.indexOf('}'))
  }

  it('is held right of the message box’s left edge', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('topbar')) return new DOMRect(0, 0, 1280, 80)
      if (this.classList.contains('message-wrap')) return new DOMRect(552, 16, 720, 56)
      return new DOMRect(0, 0, 0, 0)
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('topbar-modes') ? 220 : 0
    })
    renderApp()

    const bar = $('.topbar')!
    expect(bar.style.getPropertyValue('--box-left'), 'where the box starts was not measured').toBe('552px')
    expect(bar.style.getPropertyValue('--modes-half')).toBe('110px')
    // The further right of the two: the bar's centre, or the strip's left edge
    // on the box's. Pushed only as far as it has to go, not re-centred.
    expect(rule(), 'the strip may be centred left of the box').toMatch(
      /left: *max\(50%, *calc\(var\(--box-left, *0px\) \+ var\(--modes-half, *0px\)\)\)/,
    )
    vi.restoreAllMocks()
  })

  // Where nothing can be measured nothing is set, and the strip stays on the
  // bar's centre — the first paint, and jsdom.
  it('stays on the bar’s centre where nothing can be measured', () => {
    renderApp()
    expect($('.topbar')!.style.getPropertyValue('--box-left')).toBe('')
  })
})

describe('the slot that empties the box', () => {
  const strip = () => $('.message-wrap > .topbar-clear')

  /**
   * **Nothing acts on the message from outside the box any more.**
   *
   * The three that do sit on its upper border at the right; the one that empties
   * it sits at the left of the lower one. What is left in the rail beside the box
   * is the menu and the keyboard, which are about the app rather than about the
   * message — and the board gets the whole of the width that came back.
   *
   * The strips hang off `.message-wrap` rather than off the pair of boxes: they
   * act on the message, and on a wide screen with listen mode open the pair's
   * corners belong to the question.
   */
  // The keyboard is offered only where it has been asked for — see *Peri's own
  // keyboard* — so on a board that has not asked, the menu is the whole rail.
  it('leaves nothing in the rail but the menu, and the keyboard where it is offered', () => {
    renderApp()
    expect($$('.topbar > .icon-btn').map(b => b.getAttribute('aria-label'))).toEqual(['Open menu'])

    renderApp({ keyboard: true })
    expect($$('.topbar > .icon-btn').map(b => b.getAttribute('aria-label'))).toEqual([
      'Open menu',
      'Show the keyboard',
    ])

    for (const strip of ['.topbar-actions', '.topbar-clear']) {
      expect($(`.message-wrap > ${strip}`), `${strip} is not on the message box`).not.toBeNull()
    }
  })

  /**
   * **Each of the box's four borders holds one kind of thing.**
   *
   * Upper: a mode in the middle, the microphone at the left, the three that act
   * on the message at the right. Lower: the one that empties it at the left, and
   * the language and the voice at the right — neither about the message and
   * neither urgent, set once and left, which is the border to be on.
   *
   * Asserted against the text of the stylesheet, which is all jsdom allows —
   * whether they land on the lines is a question for the deploy preview.
   */
  it('puts the two value controls on the lower border and the actions on the upper', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const edge = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      const block = rule.slice(0, rule.indexOf('}'))
      return ['top', 'bottom'].filter(side => new RegExp(`^ *${side}: `, 'm').test(block))
    }

    expect(edge('.topbar-actions'), 'the three that act on the message left the upper border').toEqual(['top'])
    expect(edge('.topbar-listen'), 'the microphone left the upper border').toEqual(['top'])
    expect(edge('.topbar-choices'), 'the language and the voice are not on the lower border').toEqual(['bottom'])
    expect(edge('.topbar-clear'), 'the one that empties the box is not on the lower border').toEqual(['bottom'])
  })

  it('rides the box border rather than sitting in the rail beside it', () => {
    renderApp()
    expect(strip(), 'it is not on the box at all').not.toBeNull()
    expect(strip()!.querySelector('.icon-btn.on-border')).not.toBeNull()
    // And nothing of it is left in the rail, which is the width the board gets
    // back — a button both here and there would be the same control twice.
    expect(iconBtn('Clear')!.closest('.topbar-clear')).not.toBeNull()
  })

  /**
   * **It follows the message box, not the pair of boxes.**
   *
   * The microphone and the two value controls hang off the wrapper, which is the
   * same size in the same place whether listen mode is open or not — that is what
   * holds them at one point on screen. This one cannot do that: on a wide screen
   * with listen mode open, the wrapper's left edge is the *question's* left edge,
   * and a Clear riding that border would be a Clear on somebody else's words.
   */
  it('hangs off the message box rather than off the pair of them', () => {
    renderApp()
    const wrap = strip()!.parentElement!
    expect(wrap.querySelector(':scope > .text-display'), 'it is not on the message box').not.toBeNull()
    expect(wrap.querySelector(':scope > .heard-wrap'), 'the question is in here too').toBeNull()
  })

  /**
   * It means two things and sits in one place, which is what makes the mode a
   * change of meaning rather than a change of layout — the same rule the three
   * controls on the right of this bar follow.
   */
  it('keeps its place in edit mode, where it starts a new phrase instead', () => {
    renderApp()
    expect(iconBtn('Clear')!.closest('.topbar-clear')).not.toBeNull()
    expect(iconBtn('Start a new phrase'), 'the phrase controls are showing already').toBeUndefined()

    click(editToggle())
    expect(iconBtn('Clear'), 'the message controls are still showing').toBeUndefined()
    expect(iconBtn('Start a new phrase')!.closest('.topbar-clear')).not.toBeNull()
  })

  /**
   * **Every control on the two boxes' borders stands on the one ground, at the
   * microphone's size.** They were black grounds, then a set of different sizes —
   * speak at twice everything else, the heard box's tools a little larger than
   * the rest. One grey at fifteen per cent and one height now, so the border
   * furniture reads as one set rather than as things added one at a time.
   *
   * Asserted against the text of the stylesheet, which is all jsdom allows —
   * whether it looks right is a question for the deploy preview.
   */
  it('stands every border control on one grey ground, at the microphone’s size', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const block = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      return rule.slice(0, rule.indexOf('}'))
    }
    const value = (selector: string, prop: string) =>
      block(selector).match(new RegExp(`\\b${prop}: *([^;]+);`))?.[1]

    // Grey at fifteen per cent *mixed into the bar*, not laid over it: these all
    // sit on a border, and a see-through ground let the box's line run through
    // the glyphs themselves.
    expect(css, 'the ground is not a fifteen-per-cent grey').toMatch(
      /--border-ground: *color-mix\(in srgb, rgb\(128 128 128\) 15%, var\(--surface\)\)/,
    )
    for (const strip of [
      '.topbar-modes',
      '.topbar-listen',
      '.topbar-clear',
      '.topbar-actions',
      '.edit-bar',
      '.heard-btn',
      '.heard-live',
      '.choice-btn',
    ]) {
      expect(value(strip, 'background'), `${strip} stands on a ground of its own`).toBe('var(--border-ground)')
    }

    // The microphone is a mode toggle; everything else on a border is measured by it.
    const mic = { box: value('.mode-btn', 'height'), glyph: value('.mode-btn svg', 'height') }
    expect(value('.icon-btn.on-border', 'height')).toBe(mic.box)
    expect(value('.icon-btn.on-border svg', 'height')).toBe(mic.glyph)
    expect(value('.heard-btn svg', 'height'), 'the heard box draws its glyphs at another size').toBe(mic.glyph)
    expect(value('.heard-live', 'height'), 'the live light is not the tools’ size').toBe('var(--heard-tool)')
    expect(value('.heard-live svg', 'height'), 'the live light draws its glyph at another size').toBe(mic.glyph)
    expect(block('.icon-btn.on-border.is-primary'), 'speak is sized apart from the rest again').not.toMatch(
      /(width|height):/,
    )
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

  // Paste keeps the end of the row while the two beside it change with the mode,
  // being the one of the three that means the same thing either way.
  /**
   * Paste keeps the **middle** of the row in both modes, being the one of the
   * three that means the same thing either way. What is at the end is what the
   * mode is for — speak, or in edit mode save — and it is half again the size of
   * the two beside it.
   */
  it('sits between copy and speak, on the box upper border', () => {
    renderApp()
    const actions = $$('.topbar-actions .icon-btn').map(b => b.getAttribute('aria-label'))
    expect(actions).toEqual(['Copy to clipboard', 'Paste from clipboard', 'Speak'])

    // The end of the row is what the mode is for, and it is the one drawn large.
    const primary = () => $('.topbar-actions .icon-btn:last-child')!
    expect(primary().getAttribute('aria-label')).toBe('Speak')
    expect(primary().classList.contains('is-primary'), 'speak is not the large one').toBe(true)

    click(editToggle())
    const editing = $$('.topbar-actions .icon-btn').map(b => b.getAttribute('aria-label'))
    expect(editing).toEqual(['Delete phrase', 'Paste from clipboard', 'Save phrase'])
    expect(primary().classList.contains('is-primary'), 'save is not the large one').toBe(true)
  })

  // Never disabled: what is on the clipboard is not this app's to know until it
  // asks, so a paste with nothing behind it says so rather than being greyed out.
  it('stays live with an empty message, unlike speak and copy', () => {
    renderApp()
    expect(iconBtn('Speak')?.hasAttribute('disabled')).toBe(true)
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
    click($('.edit-toggle'))
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
  const keyNamed = (name: string) =>
    [...document.querySelectorAll('.key')].find(k => k.getAttribute('aria-label') === name)!
  const toggleKeyboard = () => click(iconBtn('Show the keyboard') ?? iconBtn('Hide the keyboard'))

  it('is not there until it is asked for', () => {
    renderApp({ keyboard: true })
    expect(keyboard()).toBeNull()
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

  /**
   * And deliberately *not* in edit mode. There the box holds a phrase being
   * written, and narrowing would take away the very phrases somebody opened the
   * board to edit, letter by letter as they typed.
   */
  it('leaves the board alone while a phrase is being written', () => {
    renderApp({ keyboard: true })
    click(editToggle())
    act(() => box().focus())
    toggleKeyboard()
    const before = cells().length

    click(keyNamed('h'))
    click(keyNamed('e'))
    click(keyNamed('l'))
    expect(cells().length, 'the phrases being edited disappeared as they were typed over').toBe(before)
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
