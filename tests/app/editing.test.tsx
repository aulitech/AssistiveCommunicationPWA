// Writing a phrase and rewording one, which in edit mode happens in the message box rather than in a dialog.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scrolledIntoView, unmeasuredGrid } from '../setup'
import {
  $$,
  $,
  settle,
  click,
  renderApp,
  cells,
  editToggle,
  speakToggle,
  plainCell,
  slotCell,
  box,
  iconBtn,
  phraseVoice,
  writeIn,
  writePhrase,
  savePhrase,
  deletePhrase,
  editTitle,
  clearMessage,
} from './harness'

// Regression guard, and the destructive kind: the editor used to open on
// `phrase.text`, which has had its slots resolved into labels. Opening a
// fill-in-the-blank phrase showed "I want the red/blue one" and saving it stored
// exactly that — flattening the slot, with no way back and nothing said about it.
describe('editing a phrase that has choices behind it', () => {
  const enterEditMode = () => click(editToggle())
  const save = () => savePhrase()

  it('opens on what the phrase was written as, brackets and all', () => {
    renderApp()
    enterEditMode()
    const cell = slotCell()
    const shown = cell.textContent!
    click(cell)

    const source = box().value
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
  // The same box the message is composed in. It was a second textarea in a
  // dialog until the editor moved onto the main screen; the dwell is what has
  // to keep working in both of the box's jobs.
  const field = () => box()
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

  /** Edit mode, with a phrase of the board loaded into the box. */
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
    expect(editTitle()).toBe('Editing phrase')
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
    writePhrase('EDITED PHRASE')
    savePhrase()

    expect(cells()[0].textContent).toBe('EDITED PHRASE')
    expect(cells()[0].textContent).not.toBe(before)
  })

  it('adds an emergency phrase', () => {
    renderApp()
    click(editToggle())
    expect($('.emergency-add')).not.toBeNull()

    const before = $$('.emergency-btn').length
    click($('.emergency-add'))
    expect(editTitle()).toMatch(/emergency/i)

    writePhrase('I need my inhaler')
    savePhrase()

    const labels = $$('.emergency-btn .emergency-label').map(e => e.textContent)
    expect($$('.emergency-btn')).toHaveLength(before + 1)
    expect(labels).toContain('I need my inhaler')
  })

  it('removes a deleted phrase from the grid', () => {
    renderApp()
    click(editToggle())

    const doomed = cells()[0].textContent
    click(cells()[0])
    deletePhrase()

    expect(cells()[0].textContent).not.toBe(doomed)
  })

  // The two ask opposite things of the same dwell — one makes a phrase a thing
  // to say this instant, the other a thing to rewrite — so a board cannot be in
  // both at once.
  it('switches auto-speak off when it starts', () => {
    renderApp()
    click(speakToggle())
    expect(speakToggle().getAttribute('aria-pressed')).toBe('true')

    click(editToggle())
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)
    expect(speakToggle().getAttribute('aria-pressed')).toBe('false')
  })

  it('is switched off by auto-speak in turn', () => {
    renderApp()
    click(editToggle())
    expect(editToggle().getAttribute('aria-pressed')).toBe('true')

    click(speakToggle())
    expect(editToggle().getAttribute('aria-pressed')).toBe('false')
    expect($('.app')?.classList.contains('edit-mode')).toBe(false)
  })

  // Typing narrows the grid to the word being written, which is how a gaze user
  // finishes a word. Edit mode carries whatever was composed in with it, and
  // narrowing the board to a word of that would take away the very phrases
  // somebody came to edit.
  //
  // The message has to be left in the box rather than cleared first: writing a
  // phrase writes the draft and never the message, so a cleared box narrows the
  // grid to nothing whether the guard is there or not.
  // Asked of the cells rather than of how many there are: the grid renders a
  // windowful of whatever list it is given, so a narrowed board and a whole one
  // are both a screenful, and only what is in them tells the two apart.
  //
  // A word rather than a whole phrase, and deliberately: a box holding one that
  // is already on the board takes the board to it — see *going to the phrase
  // the message is* — and this is about the grid it lands on, not which one.
  it('does not narrow the board to the message it came in with', () => {
    renderApp()
    const board = cells().map(c => c.textContent)

    writeIn(box(), 'wat')
    const narrowed = cells().map(c => c.textContent)
    expect(narrowed, 'composing did not narrow the grid at all').not.toEqual(board.slice(0, narrowed.length))

    click(editToggle())

    const inEditMode = cells().map(c => c.textContent)
    expect(inEditMode).toEqual(board.slice(0, inEditMode.length))
    expect(box().value, 'the message did not come with it').toBe('wat')
  })

  // A phrase listed twice in one category is a cell somebody has to read past to
  // reach the one they meant. Save goes quiet rather than away, and the strip
  // says why — a disabled control explains nothing by itself.
  //
  // Driven from a phrase the test put there rather than one off the board: what
  // a cell *reads* as is not always what it was written as, and the check is on
  // the wording.
  describe('a phrase that is already there', () => {
    const KITCHEN = { id: 'custom-kettle', text: 'Put the kettle on', category: 'Kitchen' }
    const seed = () => {
      localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify({ custom: [KITCHEN] }))
      renderApp()
      click(editToggle())
    }
    const chooseCategory = (name: string) => {
      click($('.category-trigger'))
      click(
        [...document.body.querySelectorAll('.picker-tile')].find(
          t => t.querySelector('.picker-tile-name')?.textContent === name,
        ),
      )
      click(
        [...document.body.querySelectorAll('.picker-modal-actions .panel-btn')].find(
          b => b.getAttribute('aria-label') === 'Done',
        ),
      )
    }

    it('cannot be saved a second time', () => {
      seed()
      chooseCategory('Kitchen')
      writePhrase(KITCHEN.text)

      expect(editTitle()).toMatch(/already on the board/i)
      expect(iconBtn('Save phrase')?.disabled).toBe(true)

      writePhrase(`${KITCHEN.text} please`)
      expect(editTitle()).toBe('New phrase')
      expect(iconBtn('Save phrase')?.disabled).toBe(false)
    })

    // Case and spacing are not the difference between two phrases.
    it('is recognised through case and spacing', () => {
      seed()
      chooseCategory('Kitchen')
      writePhrase(`  ${KITCHEN.text.toUpperCase()}  `)

      expect(iconBtn('Save phrase')?.disabled).toBe(true)
    })

    // Opening a phrase and saving it unchanged is not adding a duplicate of it.
    it('is not a duplicate of itself', () => {
      // Looks for a phrase among the table's thousands, so the board has to be
      // holding all of them rather than the windowful it renders when measured.
      unmeasuredGrid()
      seed()
      click(cells().find(c => c.textContent === KITCHEN.text)!)

      expect(editTitle()).toBe('Editing phrase')
      expect(iconBtn('Save phrase')?.disabled).toBe(false)
    })

    // The table lists "Good morning" under three categories on purpose, and
    // somebody looks in whichever of them they think in.
    it('is allowed again under another category', () => {
      seed()
      chooseCategory('Kitchen')
      writePhrase(KITCHEN.text)
      expect(iconBtn('Save phrase')?.disabled).toBe(true)

      chooseCategory('Food')
      expect(iconBtn('Save phrase')?.disabled).toBe(false)
    })

    // The bar is a category like any other for this purpose.
    it('is refused on the emergency bar too', () => {
      renderApp()
      click(editToggle())
      const first = $('.emergency-btn .emergency-label')!.textContent!

      click($('.emergency-add'))
      writePhrase(first)

      expect(editTitle()).toMatch(/already on the board/i)
      expect(iconBtn('Save phrase')?.disabled).toBe(true)
    })
  })

  /**
   * The strip rides the lower border of the message box, exactly as the modes
   * ride the upper one — which it can only do from inside the bar the box is in.
   *
   * **The voice is not in it.** A phrase's voice is the pair at the box's
   * lower-right corner in edit mode, the same pair that is the board's outside
   * it: one pair of controls meaning whichever of the two the mode says, rather
   * than two pairs that look alike and are not.
   */
  it('puts the category on the message box itself, and the voice on its corner', () => {
    renderApp()
    click(editToggle())

    expect($('.topbar > .edit-bar')).not.toBeNull()
    expect($('.edit-bar .category-trigger')).not.toBeNull()
    expect($('.edit-bar .voice-trigger'), 'the strip still carries a voice of its own').toBeNull()

    const voice = $$('.topbar-choices .choice-btn').map(b => b.getAttribute('aria-label') ?? '')
    expect(voice.some(l => /voice for this phrase/i.test(l))).toBe(true)
  })

  // The two numbers that put it there. `.topbar` padding-bottom is where the
  // box's lower border falls; the strip's `bottom`, with `translateY(50%)`, is
  // where its own centre line falls — so they have to be the same number, and
  // are one variable for that reason. Written as two they drifted apart at the
  // first change, leaving the strip centred 20px below the border it rides.
  //
  // jsdom applies no cascade and lays nothing out, so this can only check that
  // the rule is written. Whether it takes effect is for the deploy preview.
  it('centres that strip on the border rather than below it', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).toMatch(/\.app\.edit-mode \.topbar \{ padding-bottom: var\(--edit-bar-inset\); \}/)
    expect(css).toMatch(/\.edit-bar \{[^}]*\bbottom: var\(--edit-bar-inset\);/)
    // Half the strip's height, so its lower edge reaches the bottom of the bar
    // and no further — any more and it hangs over the category tabs.
    // Read as numbers, and checked to be numbers first: `Object.is(NaN, NaN)`
    // is true, so a regex that stops matching would otherwise pass this.
    const inset = Number(css.match(/--edit-bar-inset: ([\d.]+)rem/)?.[1])
    const height = Number(css.match(/\.edit-bar \{[^}]*\bheight: ([\d.]+)rem/)?.[1])
    expect(height, 'the strip no longer states a height in rem').toBeGreaterThan(0)
    expect(inset).toBe(height / 2)
  })

  // Saving leaves the editor on a blank phrase rather than closing anything —
  // there is nothing to close — so the toast is the only thing that says it
  // happened at all.
  it('says a phrase was saved, and empties the box for the next one', () => {
    renderApp()
    click(editToggle())
    writePhrase('Something worth keeping')
    savePhrase()

    expect($('.toast')?.textContent).toMatch(/added to/i)
    expect(box().value).toBe('')
    expect(editTitle()).toBe('New phrase')
  })
})

// Adding a phrase *is* entering edit mode now: the box carries whatever was
// composed in it straight into the phrase being written, so a message worth
// keeping becomes a phrase without being typed a second time. There was a dialog
// held open by a dwell on the box, and it is gone along with the rest of them.
describe('keeping a composed message as a phrase', () => {
  const enterEditMode = () => click(editToggle())
  const compose = (value: string) => writeIn(box(), value)

  it('carries the composed message into the phrase being written', () => {
    renderApp()
    compose('  Please pass me the water  ')
    enterEditMode()

    expect(box().value).toBe('Please pass me the water')
    expect(editTitle()).toBe('New phrase')
  })

  it('saves the carried message as a real phrase', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    compose('Please pass me the water')
    enterEditMode()
    savePhrase()
    click(editToggle()) // leave edit mode
    clearMessage()

    expect(cells().map(c => c.textContent)).toContain('Please pass me the water')
  })

  it('starts empty when nothing is composed, with nothing to save', () => {
    renderApp()
    enterEditMode()

    expect(box().value).toBe('')
    expect(iconBtn('Save phrase')?.disabled).toBe(true)
  })

  // Two different things share the one box, and only one of them is on screen
  // at a time. Writing a phrase must not rewrite the sentence somebody was part
  // way through saying.
  it('gives the message back when edit mode ends', () => {
    renderApp()
    compose('Please pass me the water')
    enterEditMode()
    writePhrase('Something else entirely')
    click(editToggle())

    expect(box().value).toBe('Please pass me the water')
  })

  // The dwell primitive cancels Space so it cannot scroll the grid. Spread onto
  // a box people type in, the first space typed would vanish — in either mode,
  // since the box is typed in in both of them now.
  it('does not swallow Space while composing', () => {
    renderApp()
    expect(fireEvent.keyDown(box(), { key: ' ' })).toBe(true)
  })

  it('does not swallow Space while writing a phrase', () => {
    renderApp()
    enterEditMode()
    expect(fireEvent.keyDown(box(), { key: ' ' })).toBe(true)
  })
})

// Where a phrase is filed, and where the board is afterwards. Shared, because
// both questions are asked through the same full-screen grid and the same tabs.
const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const enterEditMode = () => click(editToggle())
const leaveEditMode = () => click(editToggle())
const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
/** Which tab the board is on, as the bar itself says. */
const activeTab = () => $('.filter-tab[aria-selected="true"]')?.textContent
// The category is chosen from a full-screen grid now, portalled to the body,
// so it is reached through the document rather than through the container.
const categoryTrigger = () => $('.category-trigger')!
const shownCategory = () => categoryTrigger().querySelector('.picker-trigger-label')!.textContent
const tileNames = () => inDoc('.picker-tile .picker-tile-name').map(t => t.textContent!)
const pickerBtn = (label: string) =>
  inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)
/** What the grid offers, leaving the choice as it found it. */
const categoryChoices = () => {
  click(categoryTrigger())
  const names = tileNames().filter(n => n !== 'New category…')
  click(pickerBtn('Cancel'))
  return names
}
const chooseCategory = (name: string) => {
  click(categoryTrigger())
  click(inDoc('.picker-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === name))
  click(pickerBtn('Done'))
}
/** A category that is not the one the editor starts on. */
const someOtherCategory = () => {
  const opening = shownCategory()
  return categoryChoices().find(name => name !== opening)!
}
const addPhrase = (text: string, category?: string) => {
  writePhrase(text)
  if (category) chooseCategory(category)
  savePhrase()
}
/** In edit mode, on a category tab, with somewhere else to file things. */
const standingOn = () => {
  renderApp()
  enterEditMode()
  const here = shownCategory()!
  const elsewhere = categoryChoices().find(name => name !== here)!
  leaveEditMode()
  click(tab(here))
  enterEditMode()
  return { here, elsewhere }
}

describe('starting from the last choice made', () => {
  const voiceTrigger = phraseVoice
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

  // Filing phrases is done in runs. Starting each one from the alphabetically
  // first category means making the same choice over and over.
  it('files the next new phrase where the last one went', () => {
    renderApp()
    enterEditMode()

    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)

    expect(shownCategory()).toBe(elsewhere)
  })

  describe('and from the tab in front of them', () => {
    /** Somewhere to file things that is not where the editor already is. */
    const goElsewhere = () => {
      const elsewhere = someOtherCategory()
      leaveEditMode()
      click(tab(elsewhere))
      return elsewhere
    }

    // Somebody who opens edit mode with a category on screen is adding to that
    // category, nearly every time — and the alternative is a picker landing on
    // wherever the last phrase went, which after one trip to another tab is the
    // wrong answer for every phrase after it.
    it('files the next new phrase under the category being looked at', () => {
      renderApp()
      enterEditMode()
      const elsewhere = goElsewhere()

      enterEditMode()

      expect(shownCategory()).toBe(elsewhere)
    })

    // It is where somebody had got to, and a board on a mounted device is
    // reloaded by whoever charges it rather than by the person using it.
    it('remembers the tab across a reload', () => {
      renderApp()
      enterEditMode()
      const elsewhere = goElsewhere()
      enterEditMode()

      cleanup()
      renderApp()
      enterEditMode()

      expect(shownCategory()).toBe(elsewhere)
    })

    // Filing under the tab is about where a phrase goes and nothing else. The
    // voice is the other half of that record and belongs to whoever set it.
    it('keeps the remembered voice while it files', () => {
      localStorage.setItem('peri_recent', JSON.stringify({ voice: 'elevenlabs:v1' }))
      localStorage.setItem(
        'peri_elevenlabs',
        JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
      )
      renderApp()
      enterEditMode()
      goElsewhere()
      enterEditMode()

      expect(JSON.parse(localStorage.getItem('peri_recent')!).voice).toBe('elevenlabs:v1')
    })

    // Leaving edit mode says nothing about where anything belongs. Filing on
    // the way out as well would undo the category somebody had just chosen,
    // the moment they left the mode they chose it in.
    it('files nothing on the way out', () => {
      renderApp()
      enterEditMode()
      const elsewhere = goElsewhere()
      enterEditMode()

      const chosen = categoryChoices().find(name => name !== elsewhere)!
      addPhrase('One for over there', chosen)
      leaveEditMode()

      click(tab('All'))
      enterEditMode()

      expect(shownCategory()).toBe(chosen)
    })

    // Only on the way *in*. A draft that refiled itself every time somebody
    // looked at another tab would change where a phrase goes without being
    // asked — including one they had already chosen a category for.
    it('leaves the draft where it is when the tab changes under it', () => {
      renderApp()
      enterEditMode()
      const elsewhere = goElsewhere()
      enterEditMode()

      click(tab('All'))

      expect(shownCategory()).toBe(elsewhere)
    })

    // None of the four is somewhere a phrase can be filed: All is every
    // category at once, and the other three are records of what was said. So
    // they leave the last choice standing rather than throwing it away and
    // making somebody pick again.
    for (const notACategory of ['All', 'Sent', 'Translations']) {
      it(`leaves it standing under ${notACategory}`, () => {
        renderApp()
        enterEditMode()
        const elsewhere = goElsewhere()
        // Landed on, so the tab is the only thing that could change it back.
        enterEditMode()
        leaveEditMode()

        click(tab(notACategory))
        enterEditMode()

        expect(shownCategory()).toBe(elsewhere)
      })
    }
  })

  it('remembers it across a reload', () => {
    renderApp()
    enterEditMode()
    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)

    cleanup()
    renderApp()
    enterEditMode()

    expect(shownCategory()).toBe(elsewhere)
  })

  // Opening a phrase to fix a typo must not quietly refile it or change how it
  // sounds, so a phrase that already has either shows its own.
  it('leaves an existing phrase showing its own category', () => {
    renderApp()
    enterEditMode()
    const elsewhere = someOtherCategory()
    addPhrase('One for over there', elsewhere)

    click(cells().find(c => c.textContent !== 'One for over there')!)
    expect(shownCategory()).not.toBe(elsewhere)
  })

  // A category can be renamed or emptied away between one phrase and the next,
  // and a phrase filed under one the grid does not offer is a phrase nobody can
  // find their way back to.
  it('ignores a remembered category that no longer exists', () => {
    localStorage.setItem('peri_recent', JSON.stringify({ category: 'Somewhere Deleted' }))
    renderApp()
    enterEditMode()

    const choices = categoryChoices()
    expect(choices).not.toContain('Somewhere Deleted')
    expect(shownCategory(), 'the editor started on nothing').not.toBe('')
    expect(choices).toContain(shownCategory())
  })

  it('starts a new phrase from the last voice, and an existing one from its own', async () => {
    localStorage.setItem(
      'peri_elevenlabs',
      JSON.stringify({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['a']) })),
    )
    renderApp()
    enterEditMode()

    // Give one phrase a voice.
    writePhrase('In her voice')
    click(voiceTrigger())
    click(inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').startsWith('Rachel')))
    click(inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === 'Done'))
    savePhrase()
    await flush()

    // The next new one starts there.
    expect(voiceTrigger()?.textContent).toContain('Rachel')

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

// **What somebody just made is on screen.** A phrase filed anywhere but the
// tab in front of them lands among a couple of thousand cells, and all they
// have to show for writing one is a line of text that fades.
describe('following a new phrase to where it was filed', () => {
  it('takes the board to the category it was filed under', () => {
    const { here, elsewhere } = standingOn()

    addPhrase('One for over there', elsewhere)

    expect(activeTab()).toBe(elsewhere)
    expect(activeTab()).not.toBe(here)
  })

  it('stays where it is when the phrase was filed there', () => {
    const { here } = standingOn()

    addPhrase('One for right here')

    expect(activeTab()).toBe(here)
  })

  // All shows every category at once, so the phrase is already on screen and
  // there is nowhere to go — leaving somebody on the tab they chose.
  it('leaves the board on All, where the phrase already is', () => {
    renderApp()
    enterEditMode()
    const elsewhere = someOtherCategory()

    addPhrase('One for over there', elsewhere)

    expect(activeTab()).toBe('All')
  })

  // A phrase being reworded is one somebody is moving *out* of where they are.
  // Refiling several out of one category is a run they would be thrown out of
  // after the first.
  it('does not follow a phrase being reworded out of the category', () => {
    const { here, elsewhere } = standingOn()

    click(cells()[0])
    chooseCategory(elsewhere)
    savePhrase()

    expect(activeTab()).toBe(here)
  })

  // The bar is on screen under every tab, so a phrase added to it is already
  // where somebody can see it. Added from Sent, where the draft carries a
  // category the board is not showing — which is the only way it could move.
  it('does not move for a phrase added to the emergency bar', () => {
    standingOn()
    click(tab('Sent'))

    click($('.emergency-add'))
    writePhrase('Call my sister')
    savePhrase()

    expect(activeTab()).toBe('Sent')
  })

  /** What the browser does by itself when a cell lands under a motionless pointer. */
  const arrivesUnderThePointer = () => {
    fireEvent.pointerEnter(cells()[0])
    act(() => void vi.advanceTimersByTime(1500))
    settle()
  }

  // Every cell on the board has just been replaced under a pointer that has
  // not moved, and in edit mode the one that lands underneath opens for
  // rewording — which is somebody's own phrase, loaded into the box they were
  // about to write the next one in.
  it('refuses the cell that lands under a motionless pointer', () => {
    const { elsewhere } = standingOn()
    addPhrase('One for over there', elsewhere)

    arrivesUnderThePointer()

    expect(box().value, 'a phrase opened itself for rewording').toBe('')
  })

  // And it is not deaf where the board did not move. A save that leaves
  // somebody on the tab they were on has replaced nothing, so refusing their
  // next dwell would cost them a phrase for nothing.
  it('is still listening where the board stayed put', () => {
    standingOn()
    addPhrase('One for right here')

    arrivesUnderThePointer()

    expect(box().value).not.toBe('')
  })

  // Keeping a message is the case with the least to show for it otherwise:
  // the record it came off is unchanged, so without this nothing on screen
  // moves at all.
  it('takes the board to where a kept message was filed', () => {
    renderApp()
    click(plainCell())
    click(iconBtn('Speak'))
    clearMessage()
    clearMessage()

    click(tab('Sent'))
    enterEditMode()
    click(cells()[0])
    const filedUnder = shownCategory()!
    click(iconBtn('Keep this message as a phrase'))

    expect(filedUnder).not.toBe('Sent')
    expect(activeTab()).toBe(filedUnder)
  })
})

// A save that leaves nothing on screen but a toast is a save with nothing to
// show for it. Two halves: which cell it is, and where on the board to find it.
describe('showing where the new phrase went', () => {
  const marked = () => $('.phrase-cell[aria-current="true"]')?.textContent
  const cellFor = (text: string) => $$('.phrase-cell').find(c => c.textContent === text)
  const tabsBroughtIntoView = () =>
    scrolledIntoView.filter(el => el.classList.contains('filter-tab')).map(el => el.textContent)

  it('marks the phrase it has just made', () => {
    const { elsewhere } = standingOn()

    addPhrase('One for over there', elsewhere)

    expect(marked()).toBe('One for over there')
  })

  it('brings it into view', () => {
    const { elsewhere } = standingOn()

    addPhrase('One for over there', elsewhere)

    expect(scrolledIntoView).toContain(cellFor('One for over there'))
  })

  // The window starts again at a screenful on arriving at a tab, and a category
  // runs to a hundred and eighty phrases — so the new one is past the end of
  // what is rendered, and a cell that does not exist is nothing to scroll to.
  it('reaches a phrase past the end of what is rendered', () => {
    renderApp()
    // One of the longest categories the board ships with.
    click(tab('Information'))
    enterEditMode()

    addPhrase('One at the very end')

    const cell = cellFor('One at the very end')
    expect(cell, 'the new cell was never rendered at all').toBeDefined()
    expect(scrolledIntoView).toContain(cell)
  })

  // Forty-two categories is several screens of tabs, so a board that changed
  // tabs by itself would otherwise be showing one whose tab is off the end.
  it('brings the tab it moved to into the middle of the bar', () => {
    const { elsewhere } = standingOn()

    addPhrase('One for over there', elsewhere)

    expect(tabsBroughtIntoView()).toContain(elsewhere)
  })

  // A tab somebody dwelled on is one they were already looking at, and sliding
  // it out from under a gaze that has not moved is how the next dwell lands on
  // its neighbour. So only where the board moved by itself.
  it('leaves the bar where it is when the board did not move', () => {
    standingOn()

    addPhrase('One for right here')

    expect(tabsBroughtIntoView()).toEqual([])
  })

  // Rewording one puts no new cell anywhere, so there is nothing to point at.
  it('marks nothing for a phrase being reworded', () => {
    standingOn()
    click(cells()[0])

    writePhrase('Reworded, and nowhere new')
    savePhrase()

    expect(marked()).toBeUndefined()
  })

  // What the mark claims — this is the last thing you did — stops being true
  // the moment anything else happens.
  it('lets the mark go on the next dwell', () => {
    const { elsewhere } = standingOn()
    addPhrase('One for over there', elsewhere)

    click(cells().find(c => c.textContent !== 'One for over there')!)

    expect(marked()).toBeUndefined()
  })
})

// A message box holding one phrase — which is what it holds the moment one is
// chosen while composing — is somebody pointing at that phrase. What they got
// for reaching for edit mode was a copy of it, filed wherever they happened to
// be standing, that could not be saved and said only "Already on the board".
//
// **Composed on All**, which is where this happens: choosing a phrase narrows
// the board to the word at the caret and takes the category bar away with it,
// so the tab somebody is standing on when they reach for edit mode is the one
// they chose the phrase from — All, or the phrase's own.
describe('going to the phrase the message is', () => {
  const marked = () => $('.phrase-cell[aria-current="true"]')?.textContent
  const cellFor = (text: string) => $$('.phrase-cell').find(c => c.textContent === text)

  /** A phrase of the board in the message box, with the board still on All. */
  const composeAPhrase = () => {
    renderApp()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)
    return text
  }

  it('takes the board to the category it is filed under', () => {
    const text = composeAPhrase()

    enterEditMode()

    expect(activeTab()).not.toBe('All')
    expect(marked()).toBe(text)
  })

  // All is the one tab that cannot answer *which category is this in*, not
  // showing categories being the whole of what it is for.
  it('names the category it went to, on the tab and on the strip alike', () => {
    composeAPhrase()

    enterEditMode()

    expect(activeTab()).toBe(shownCategory())
  })

  it('brings the phrase into view and the tab to the middle of the bar', () => {
    const text = composeAPhrase()

    enterEditMode()

    expect(scrolledIntoView).toContain(cellFor(text))
    expect(scrolledIntoView.filter(el => el.classList.contains('filter-tab')).map(el => el.textContent)).toContain(
      activeTab(),
    )
  })

  // The same phrase composed, put away and composed again is two occasions, and
  // the board has to answer both — which is why what the grid and the bar watch
  // is an occasion rather than the phrase's own name.
  it('goes again the next time the same phrase is composed', () => {
    const text = composeAPhrase()
    enterEditMode()
    const home = activeTab()
    leaveEditMode()
    // The box has to be emptied to reach the tabs at all: a composed phrase
    // narrows the board and the bar goes with it.
    clearMessage()
    click(tab('All'))
    click(cellFor(text))

    enterEditMode()

    expect(activeTab()).toBe(home)
    expect(marked(), 'the second time pointed at nothing').toBe(text)
  })

  it('stays where it is for a message that is no phrase at all', () => {
    renderApp()
    writeIn(box(), 'Nothing anywhere on this board says this')

    enterEditMode()

    expect(activeTab()).toBe('All')
    expect(marked()).toBeUndefined()
  })

  // The table files "Good morning" under three categories on purpose, because
  // somebody looks in whichever of the three they think in. The one they are
  // looking at is the one they mean.
  it('stays on the copy in front of them where the wording is filed twice', () => {
    renderApp()
    click(tab('Texting'))
    click(cellFor('Good morning')!)

    enterEditMode()

    expect(activeTab()).toBe('Texting')
    expect(marked()).toBe('Good morning')
  })

  // And it does not go deaf where it did not move. Nothing was replaced under
  // anybody's gaze, so refusing their next dwell would cost them one for
  // nothing — in edit mode, the phrase they were reaching for to reword.
  it('is still listening where the board stayed put', () => {
    renderApp()
    click(tab('Texting'))
    click(cellFor('Good morning')!)
    enterEditMode()

    const other = cells().find(c => c.textContent !== 'Good morning')!
    fireEvent.pointerEnter(other)
    act(() => void vi.advanceTimersByTime(1500))
    settle()

    expect(box().value, 'the board was deaf to the next dwell').not.toBe('Good morning')
  })
})
