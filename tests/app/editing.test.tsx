// Writing a phrase and rewording one, which in edit mode happens in the message box rather than in a dialog.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { fireEvent, act } from '@testing-library/react'
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
  clearMessage,
} from './harness'

// Everything Peri ships is in Library, and filing a phrase, following it and
// moving between tabs need more than one category — so each board here starts
// with three of its own. A test that writes a store of its own replaces this.
const SEEDED = {
  custom: [
    ['Tea please', 'Drinks'],
    ['Coffee please', 'Drinks'],
    ['Toast and jam', 'Food'],
    ['Soup of the day', 'Food'],
    ['Hiya there', 'Greetings'],
    ['Lovely to see you', 'Greetings'],
  ].map(([text, category], i) => ({ id: `custom-seed-${i}`, text, category })),
}
beforeEach(() => localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify(SEEDED)))

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
    act(() => void vi.advanceTimersByTime(0))
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak'))
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
  /**
   * Arriving over the box — the pointer was somewhere else entirely, and moved
   * on its way in, as a pointer does before it enters anything.
   */
  const aimAt = (x: number, y: number) => {
    fireEvent.pointerMove(document.body, { clientX: x - 120, clientY: y })
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
    // Moved on its way in, as a pointer is before it enters anything.
    fireEvent.pointerMove(document.body, { clientX: 80, clientY: 100 })
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
    expect(iconBtn('Delete phrase')?.classList.contains('is-absent'), 'no phrase open').toBe(false)
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

  // **What is typed searches the board in edit mode too**, by the rule the
  // message follows. Turning the mode on changes nothing — the word being typed
  // is still being typed — writing searches, a phrase opened off the board is
  // finished and narrows nothing, and a new phrase starts with the whole tab.
  //
  // Asked of the cells rather than of how many there are: the grid renders a
  // windowful of whatever list it is given, so a narrowed board and a whole one
  // are both a screenful, and only what is in them tells the two apart.
  it('searches the board as the phrase is written, just as composing does', () => {
    renderApp()
    const board = cells().map(c => c.textContent)

    writeIn(box(), 'wat')
    const narrowed = cells().map(c => c.textContent)
    expect(narrowed, 'composing did not narrow the grid at all').not.toEqual(board.slice(0, narrowed.length))

    click(editToggle())
    expect(
      cells().map(c => c.textContent),
      'the grid changed as edit mode came on',
    ).toEqual(narrowed)
    expect(box().value, 'the message did not come with it').toBe('wat')

    writePhrase('I want')
    const searched = cells().map(c => c.textContent ?? '')
    expect(searched.length, 'nothing found').toBeGreaterThan(0)
    expect(
      searched.every(t => /want/i.test(t)),
      'writing the phrase did not search the board',
    ).toBe(true)
    // Arranging now would arrange only what matched, so it waits, and says why.
    const arrange = () => $('.reorder-btn')!
    expect(arrange().getAttribute('aria-label')).toMatch(/start a new phrase first/i)

    // A phrase opened off the narrowed board is finished: the whole tab is back.
    const chosen = cells()[0].textContent
    click(cells()[0])
    expect(box().value).toBe(chosen)
    const opened = cells().map(c => c.textContent)
    expect(opened).toEqual(board.slice(0, opened.length))
    expect(arrange().getAttribute('aria-label')).toBe('Arrange the phrases by hand')

    writePhrase('wat')
    click(iconBtn('Start a new phrase'))
    const whole = cells().map(c => c.textContent)
    expect(whole).toEqual(board.slice(0, whole.length))
  })

  // A phrase opened is finished — until its words are changed: taking a letter
  // off its last word and the board searches for that word, as in the message.
  it('searches for the word being changed in a phrase opened to edit', () => {
    renderApp()
    click(editToggle())
    const whole = cells().map(c => c.textContent)
    click(cells()[0])
    const text = box().value
    writePhrase(text.slice(0, -1))
    const searched = cells().map(c => c.textContent)
    expect(searched, 'changing the phrase did not search the board').not.toEqual(whole.slice(0, searched.length))
  })

  // Opening a phrase off a narrowed board brings the whole tab back under the
  // pointer that chose it, so nothing may be chosen until it moves — the guard
  // composing a phrase has.
  it('holds the dwells when opening a phrase lets the whole tab back', () => {
    renderApp()
    click(editToggle())
    writePhrase('I want')
    const chosen = cells()[0].textContent
    click(cells()[0])
    expect(box().value).toBe(chosen)

    const under = cells()[0]
    fireEvent.pointerEnter(under)
    act(() => void vi.advanceTimersByTime(1500))
    settle()
    expect(box().value, 'a cell that landed under a still pointer opened').toBe(chosen)
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
    const PANTRY = { id: 'custom-flour', text: 'Fetch the flour', category: 'Pantry' }
    const seed = () => {
      localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify({ custom: [KITCHEN, PANTRY] }))
      renderApp()
      click(editToggle())
    }
    const kettles = () =>
      JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2')!).custom.filter(
        (p: { text: string }) => p.text === KITCHEN.text,
      ).length

    // On Library there is nowhere for Save to put it that it is not already.
    it('cannot be saved a second time', () => {
      seed()
      writePhrase(KITCHEN.text)

      expect(toast()).toMatch(/already on the board/i)
      expect(iconBtn('Save phrase')?.disabled).toBe(true)

      writePhrase(`${KITCHEN.text} please`)
      expect(iconBtn('Save phrase')?.disabled).toBe(false)
    })

    // Case and spacing are not the difference between two phrases.
    it('is recognised through case and spacing', () => {
      seed()
      writePhrase(`  ${KITCHEN.text.toUpperCase()}  `)

      expect(iconBtn('Save phrase')?.disabled).toBe(true)
    })

    // **Never a second copy**: Save puts the phrase that has the words in the
    // category showing, which is what somebody writing it there wanted.
    it('is added to the category showing rather than copied', () => {
      seed()
      click(tab('Pantry'))
      writePhrase(KITCHEN.text)
      expect(toast()).toBe('Already on the board — Save adds it to Pantry')

      savePhrase()

      expect($('.toast')?.textContent).toBe('Already on the board — added to Pantry')
      expect(kettles(), 'a second copy was made').toBe(1)
      expect(cells().map(c => c.textContent)).toContain(KITCHEN.text)
      click(tab('Kitchen'))
      expect(
        cells().map(c => c.textContent),
        'it left the category it was in',
      ).toContain(KITCHEN.text)
    })

    it('says so where the category showing has it already', () => {
      seed()
      click(tab('Kitchen'))
      writePhrase(KITCHEN.text)

      expect(toast()).toBe('Already in Kitchen')
      expect(iconBtn('Save phrase')?.disabled).toBe(true)
    })

    // Reworded into words another phrase has: that one is filed, and the one
    // opened is left as it was rather than becoming a copy.
    it('leaves a phrase reworded into its words as it was', () => {
      seed()
      click(tab('Pantry'))
      click(cells().find(c => c.textContent === PANTRY.text)!)
      writePhrase(KITCHEN.text)

      savePhrase()

      expect(kettles()).toBe(1)
      expect(cells().map(c => c.textContent)).toEqual(expect.arrayContaining([KITCHEN.text, PANTRY.text]))
    })

    // Opening a phrase and saving it unchanged is not adding a duplicate of it.
    it('is not a duplicate of itself', () => {
      // Looks for a phrase among the table's thousands, so the board has to be
      // holding all of them rather than the windowful it renders when measured.
      unmeasuredGrid()
      seed()
      click(cells().find(c => c.textContent === KITCHEN.text)!)

      expect(toast() ?? '', 'warned of itself').not.toMatch(/already/i)
      expect(iconBtn('Save phrase')?.disabled).toBe(false)
    })

    // The bar is a category like any other for this purpose.
    it('is refused on the emergency bar too', () => {
      renderApp()
      click(editToggle())
      const first = $('.emergency-btn .emergency-label')!.textContent!

      click($('.emergency-add'))
      writePhrase(first)

      expect(toast()).toMatch(/already on the board/i)
      expect(iconBtn('Save phrase')?.disabled).toBe(true)
    })
  })

  /**
   * **Nothing is said in the card about what is being edited** — the box with
   * the words in it says that — and words already on the board are said in a
   * toast. **Where it is filed is not chosen there**: the tab showing says so.
   *
   * **The voice is not in it.** A phrase's voice is the pair in the card's row in
   * edit mode, the same pair that is the board's outside it: one pair of controls
   * meaning whichever of the two the mode says, rather than two pairs that look
   * alike and are not.
   */
  it('says words already on the board in a toast, nothing beside the words, and puts the voice in its row', () => {
    renderApp()
    click(editToggle())

    expect($('.message-line')!.children, 'something beside the words').toHaveLength(2)
    writePhrase('Tea please')
    expect(toast()).toBe('Already on the board')
    expect($('.message-line')!.children, 'something beside the words').toHaveLength(2)
    expect($('.category-trigger'), 'a category chooser in the card').toBeNull()

    const voice = $$('.message-tools .topbar-choices .choice-btn').map(b => b.getAttribute('aria-label') ?? '')
    expect(voice.some(l => /voice for this phrase/i.test(l))).toBe(true)
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
    expect(iconBtn('Save phrase'), 'Save is drawn with no words to save').toBeUndefined()
  })

  // **Switching modes changes nothing in the box or the grid.** Leaving edit
  // mode, what the box holds becomes the message — words, caret and the word
  // being typed — so the grid stays narrowed to what it was narrowed to.
  it('keeps what the box holds, and the grid, when edit mode ends', () => {
    renderApp()
    compose('Please pass me the water')
    enterEditMode()
    writePhrase('I want')
    const narrowed = cells().map(c => c.textContent)

    click(editToggle())

    expect(box().value).toBe('I want')
    expect(
      cells().map(c => c.textContent),
      'the grid changed as edit mode ended',
    ).toEqual(narrowed)
  })

  // A phrase with choices in it is carried as the board shows it, rather than
  // with the markup it was written in, which a message would say out loud.
  it('carries a phrase with choices in it as it reads, not as it is written', () => {
    renderApp()
    enterEditMode()
    writePhrase("I'd like the {['red', 'blue']} one")
    click(editToggle())

    expect(box().value).not.toMatch(/[{}[\]]/)
    expect(box().value).toBe("I'd like the red/blue one")
  })

  // Between auto-speak and building a message the box is the message already,
  // and neither it nor the grid moves.
  it('changes nothing between auto-speak and building a message', () => {
    renderApp()
    compose('wat')
    const narrowed = cells().map(c => c.textContent)
    click(speakToggle())
    expect(box().value).toBe('wat')
    expect(cells().map(c => c.textContent)).toEqual(narrowed)
    click(speakToggle())
    expect(box().value).toBe('wat')
    expect(cells().map(c => c.textContent)).toEqual(narrowed)
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
const toast = () => $('.toast')?.textContent
const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const enterEditMode = () => click(editToggle())
const leaveEditMode = () => click(editToggle())
const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
/** Which tab the board is on, as the bar itself says. */
const activeTab = () => $('.filter-tab[aria-selected="true"]')?.textContent
/** The categories of the board's own, in the order the bar shows them. */
const categoryTabs = () =>
  $$('.filter-tab[role="tab"]')
    .map(t => t.textContent!)
    .filter(n => !['Translations', 'Answers', 'Library'].includes(n))
/** Writes a phrase and saves it, into whichever category is showing. */
const addPhrase = (text: string) => {
  writePhrase(text)
  savePhrase()
}
/** In edit mode, on a category tab, with another to go to. */
const standingOn = () => {
  renderApp()
  const [here, elsewhere] = categoryTabs()
  click(tab(here))
  enterEditMode()
  return { here, elsewhere }
}
/** What a tab holds, as the grid shows it. */
const holds = (name: string) => {
  click(tab(name))
  return cells().map(c => c.textContent)
}

/**
 * **Save puts the phrase in the category whose tab is showing** — there is no
 * category to choose in the message card. Library alone where the tab is
 * Library or a record. See `into` in `talk/use-editor.ts`.
 */
describe('saving into the category showing', () => {
  it('files a new phrase under the category whose tab is showing', () => {
    const { here } = standingOn()

    addPhrase('One for right here')

    expect($('.toast')?.textContent).toBe(`Added to Library, ${here}`)
    expect(activeTab()).toBe(here)
    expect(holds(here)).toContain('One for right here')
  })

  it('files it in Library alone on Library', () => {
    renderApp()
    enterEditMode()

    addPhrase('One for Library')

    expect($('.toast')?.textContent).toBe('Added to Library')
    for (const name of categoryTabs()) expect(holds(name)).not.toContain('One for Library')
  })

  // The tab as it is when Save is pressed, not as it was when the words began.
  it('files it where the board is when Save is pressed', () => {
    const { here, elsewhere } = standingOn()
    writePhrase('Begun here, saved there')

    click(tab(elsewhere))
    savePhrase()

    expect(holds(elsewhere)).toContain('Begun here, saved there')
    expect(holds(here)).not.toContain('Begun here, saved there')
  })

  // A category only refers to Library's phrases: one already in another stays
  // there too.
  it('adds a phrase being reworded to the category showing, and keeps it where it was', () => {
    const { here, elsewhere } = standingOn()
    click(cells()[0])
    click(tab(elsewhere))

    writePhrase('Reworded on the other tab')
    savePhrase()

    expect($('.toast')?.textContent).toBe(`Saved, and added to ${elsewhere}`)
    expect(holds(elsewhere)).toContain('Reworded on the other tab')
    expect(holds(here)).toContain('Reworded on the other tab')
  })

  it('says only Saved for a phrase in the category showing already', () => {
    standingOn()
    click(cells()[0])

    writePhrase('Reworded where it is')
    savePhrase()

    expect($('.toast')?.textContent).toBe('Saved')
  })
})

describe('starting from the last voice used', () => {
  const voiceTrigger = phraseVoice
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }

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

// **What somebody just made is on screen.** It is filed under the tab in
// front of them, or Library, which holds every phrase — so the board stays
// where it is.
describe('following a new phrase to where it was filed', () => {
  it('stays where it is when the phrase was filed there', () => {
    const { here } = standingOn()

    addPhrase('One for right here')

    expect(activeTab()).toBe(here)
  })

  // The bar is on screen under every tab, so a phrase added to it is already
  // where somebody can see it — added from Translations, where a phrase being
  // made would otherwise go to Library to be seen.
  it('does not move for a phrase added to the emergency bar', () => {
    standingOn()
    click(tab('Translations'))

    click($('.emergency-add'))
    writePhrase('Call my sister')
    savePhrase()

    expect(activeTab()).toBe('Translations')
  })

  /** What the browser does by itself when a cell lands under a motionless pointer. */
  const arrivesUnderThePointer = () => {
    fireEvent.pointerEnter(cells()[0])
    act(() => void vi.advanceTimersByTime(1500))
    settle()
  }

  // And it is not deaf where the board did not move. A save that leaves
  // somebody on the tab they were on has replaced nothing, so refusing their
  // next dwell would cost them a phrase for nothing.
  it('is still listening where the board stayed put', () => {
    standingOn()
    addPhrase('One for right here')

    arrivesUnderThePointer()

    expect(box().value).not.toBe('')
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
    standingOn()

    addPhrase('One for right here')

    expect(marked()).toBe('One for right here')
  })

  it('brings it into view', () => {
    standingOn()

    addPhrase('One for right here')

    expect(scrolledIntoView).toContain(cellFor('One for right here'))
  })

  // The window starts again at a screenful on arriving at a tab, and a category
  // runs to a hundred and eighty phrases — so the new one is past the end of
  // what is rendered, and a cell that does not exist is nothing to scroll to.
  it('reaches a phrase past the end of what is rendered', () => {
    renderApp()
    // Everything the board ships with.
    click(tab('Library'))
    enterEditMode()

    addPhrase('One at the very end')

    const cell = cellFor('One at the very end')
    expect(cell, 'the new cell was never rendered at all').toBeDefined()
    expect(scrolledIntoView).toContain(cell)
  })

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
    standingOn()
    addPhrase('One for right here')

    click(cells().find(c => c.textContent !== 'One for right here')!)

    expect(marked()).toBeUndefined()
  })
})

// A message box holding one phrase — which is what it holds the moment one is
// chosen while composing — is somebody pointing at that phrase. What they got
// for reaching for edit mode was a copy of it, filed wherever they happened to
// be standing, that could not be saved and said only "Already on the board". So
// the editor opens on the phrase itself.
//
// **And nothing else moves.** The board used to go to Library, mark the phrase
// and scroll to it; turning the mode on is a change of what a dwell does, not
// of what is in front of somebody, so the tab, the grid and the box stay.
describe('opening the phrase the message is', () => {
  const marked = () => $('.phrase-cell[aria-current="true"]')?.textContent
  const cellFor = (text: string) => $$('.phrase-cell').find(c => c.textContent === text)

  /**
   * A phrase of the board in the message box, chosen on Drinks — and the board
   * then on Food, a tab that does not hold it.
   */
  const composeAPhrase = () => {
    renderApp()
    click(tab('Drinks'))
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)
    click(tab('Food'))
    return text
  }

  it('stays on the tab it was on, even one that does not hold it, and marks nothing', () => {
    const text = composeAPhrase()
    const before = cells().map(c => c.textContent)
    scrolledIntoView.length = 0

    enterEditMode()

    expect(activeTab()).toBe('Food')
    expect(marked()).toBeUndefined()
    expect(
      cells().map(c => c.textContent),
      'the grid changed',
    ).toEqual(before)
    expect(scrolledIntoView, 'something was scrolled into view').not.toContain(cellFor(text))
    expect(box().value).toBe(text)
  })

  it('stays on a tab that holds it', () => {
    renderApp()
    click(tab('Drinks'))
    click(plainCell())

    enterEditMode()

    expect(activeTab()).toBe('Drinks')
    expect(marked()).toBeUndefined()
  })

  // On the phrase itself, not on a copy of it.
  it('opens the editor on that phrase', () => {
    const text = composeAPhrase()

    enterEditMode()

    expect(iconBtn('Delete phrase')?.classList.contains('is-absent'), 'no phrase open').toBe(false)
    expect(box().value).toBe(text)
    expect(iconBtn('Save phrase')?.disabled, 'a phrase cannot duplicate itself').toBe(false)
    expect(iconBtn('Delete phrase')).toBeDefined()
  })

  // Saving it unchanged leaves one phrase, not two — the whole of what the
  // copy could never do.
  it('saves back onto the phrase rather than beside it', () => {
    const text = composeAPhrase()
    enterEditMode()

    writePhrase(`${text}, please`)
    savePhrase()
    click(tab('Drinks'))

    const saying = $$('.phrase-cell').map(c => c.textContent)
    expect(saying).toContain(`${text}, please`)
    expect(saying).not.toContain(text)
  })

  // A new phrase is still a new phrase: nothing on the board says this.
  it('still starts a new one where the message is no phrase', () => {
    renderApp()
    writeIn(box(), 'Nothing anywhere on this board says this')

    enterEditMode()

    expect(box().value).toBe('Nothing anywhere on this board says this')
  })

  // The strip says which categories it is in; the toast says where it is.
  it('says where it is', () => {
    composeAPhrase()

    enterEditMode()

    expect($('.toast')?.textContent).toBe('Editing this phrase, in Library')
  })

  // Somebody can file their own copy of a wording Library already has — the
  // guard is per category — and look in whichever they think in. The one they
  // are looking at is the one they mean.
  it('stays on the copy in front of them where the wording is filed twice', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ custom: [{ id: 'custom-gm', text: 'Good morning', category: 'Greetings' }] }),
    )
    renderApp()
    click(tab('Greetings'))
    click(cellFor('Good morning')!)

    enterEditMode()

    expect(activeTab()).toBe('Greetings')
    expect(cellFor('Good morning')).toBeDefined()
  })

  // And it does not go deaf. Nothing was replaced under anybody's gaze, so
  // refusing their next dwell would cost them one for nothing — in edit mode,
  // the phrase they were reaching for to reword.
  it('is still listening, the board having stayed put', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [
          { id: 'custom-gm', text: 'Good morning', category: 'Greetings' },
          { id: 'custom-gd', text: 'Good day to you', category: 'Greetings' },
        ],
      }),
    )
    renderApp()
    click(tab('Greetings'))
    click(cellFor('Good morning')!)
    enterEditMode()

    const other = cells().find(c => c.textContent !== 'Good morning')!
    fireEvent.pointerEnter(other)
    act(() => void vi.advanceTimersByTime(1500))
    settle()

    expect(box().value, 'the board was deaf to the next dwell').not.toBe('Good morning')
  })
})

/**
 * **Deleting was the one change the app offered no way back from**, and the bin
 * sits a dwell's breadth from Save. So the slot at the box's lower left — the
 * one that starts a new phrase, which has nothing to do the moment after a
 * delete — offers the phrase back.
 */
describe('putting back a phrase just deleted', () => {
  const undoButton = () =>
    $$<HTMLButtonElement>('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith('Undo deleting'))
  const stored = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2') ?? '{}')
  const onBoard = () => cells().map(c => c.textContent)

  it('offers it back, by name', () => {
    renderApp()
    enterEditMode()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)

    deletePhrase()

    expect(undoButton()?.getAttribute('aria-label')).toBe(`Undo deleting “${text}”`)
  })

  it('puts it back where it was, and open in the box as it was', () => {
    renderApp()
    enterEditMode()
    const before = onBoard()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)
    deletePhrase()
    expect(onBoard()).not.toContain(text)

    click(undoButton())

    expect(onBoard().slice(0, before.length)).toEqual(before)
    expect(box().value).toBe(text)
    expect(iconBtn('Delete phrase')?.classList.contains('is-absent'), 'no phrase open').toBe(false)
    expect($('.phrase-cell[aria-current="true"]')?.textContent, 'it was not marked').toBe(text)
  })

  // A phrase somebody wrote is an entry that goes, not one that is hidden, and
  // it goes back among the others where it was — and into its category's
  // arrangement at the place it held there.
  it('puts back a phrase somebody wrote, in its place in the arrangement', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({
        custom: [
          { id: 'custom-a', text: 'Put the kettle on', category: 'Kitchen' },
          { id: 'custom-b', text: 'Make me a sandwich', category: 'Kitchen' },
          { id: 'custom-c', text: 'Is there any cake', category: 'Kitchen' },
        ],
        phraseOrder: { Kitchen: ['custom-c', 'custom-b', 'custom-a'] },
      }),
    )
    // The whole of Library on screen, to find one among thousands on it.
    unmeasuredGrid()
    renderApp()
    click(tab('Library'))
    enterEditMode()
    click(cells().find(c => c.textContent === 'Make me a sandwich'))
    deletePhrase()
    expect(stored().members.Kitchen).toEqual(['custom-c', 'custom-a'])

    click(undoButton())

    expect(stored().custom.map((p: { id: string }) => p.id)).toEqual(['custom-a', 'custom-b', 'custom-c'])
    expect(stored().members.Kitchen).toEqual(['custom-c', 'custom-b', 'custom-a'])
  })

  it('puts an emergency phrase back in its place on the bar', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ emergencyOrder: ['em-3', 'em-0', 'em-1', 'em-2', 'em-4', 'em-5'] }),
    )
    renderApp()
    enterEditMode()
    const bar = () => $$('.emergency-btn:not(.emergency-tool)').map(b => b.textContent)
    const arranged = bar()
    click($$('.emergency-btn').find(b => b.textContent === arranged[1]))
    deletePhrase()
    expect(bar()).not.toContain(arranged[1])

    click(undoButton())

    expect(bar()).toEqual(arranged)
    expect(stored().emergencyOrder).toEqual(['em-3', 'em-0', 'em-1', 'em-2', 'em-4', 'em-5'])
  })

  // Put back among the phrases nobody has used, Most used would have moved it
  // somewhere else — which is not putting it back.
  it('puts its count back', () => {
    renderApp()
    const cell = plainCell()
    const text = cell.textContent!
    click(cell)
    clearMessage()
    click(cells().find(c => c.textContent === text))
    clearMessage()
    const counted = localStorage.getItem('peri_usage')

    enterEditMode()
    click(cells().find(c => c.textContent === text))
    deletePhrase()
    expect(localStorage.getItem('peri_usage'), 'the delete kept its count').not.toBe(counted)

    click(undoButton())

    expect(JSON.parse(localStorage.getItem('peri_usage')!)).toEqual(JSON.parse(counted!))
  })

  it('stops offering once something else is written', () => {
    renderApp()
    enterEditMode()
    click(plainCell())
    deletePhrase()

    writePhrase('Something new')

    expect(undoButton()).toBeUndefined()
    expect(iconBtn('Start a new phrase')).toBeDefined()
  })

  it('stops offering once edit mode is left, and does not offer again on coming back', () => {
    renderApp()
    enterEditMode()
    click(plainCell())
    deletePhrase()

    leaveEditMode()
    enterEditMode()

    expect(undoButton()).toBeUndefined()
  })
})
