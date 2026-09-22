// The Aliases panel: the lists that fill a phrase’s choices, and every way of changing one.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { BLANK } from '../../src/core/phrases'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { SETTLE_MS } from '../../src/ui/dwell'
import { scrolledIntoView, unmeasuredGrid } from '../setup'
import { $$, $, settle, click, renderApp, message, cells } from './harness'

// The lists a phrase's slots choose from. This panel was **My details**, which
// edited two of them — `name` and `contacts` — and nothing else. All of them are
// the user's now: seeded from the table, editable and extensible.
describe('aliases', () => {
  const openAliases = () => {
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Aliases'))
  }
  const list = (name: string) => $$('.alias-list').find(l => l.getAttribute('aria-label') === name)!
  /** The lists are folded; only the open one draws its words. */
  const openList = (name: string) => {
    const head = list(name).querySelector('.alias-list-head')!
    if (head.getAttribute('aria-expanded') !== 'true') click(head)
  }
  /** The words on show, whether they are text or fields being edited. */
  const wordsIn = (name: string) => {
    openList(name)
    return [...list(name).querySelectorAll('.alias-word')].map(
      w =>
        w.querySelector('.alias-word-text')?.textContent ??
        w.querySelector<HTMLInputElement>('.alias-word-name')?.value ??
        '',
    )
  }
  const listTool = (name: string, cls: string) => {
    openList(name)
    return list(name).querySelector(`.alias-${cls}`)!
  }
  /** Deleting and rewording are only offered while the words are being edited. */
  const editWords = (name: string) => {
    const tool = listTool(name, 'edit')
    if (tool.getAttribute('aria-pressed') !== 'true') click(tool)
  }
  const addTo = (name: string, word: string) => {
    openList(name)
    const row = list(name)
    // Scoped to the add row: while the words are being edited every chip is a
    // field too, and the first input in the list is one of those.
    fireEvent.change(row.querySelector('.contact-add input')!, { target: { value: word } })
    settle()
    click(row.querySelector('.contact-add-btn'))
  }
  const stored = () => JSON.parse(localStorage.getItem('peri_aliases') ?? '{}')
  const seedDrinks = (words: string[]) => {
    localStorage.setItem('peri_aliases', JSON.stringify({ lists: { drinks: words }, hidden: [] }))
    renderApp()
    openAliases()
  }
  const storedLists = () => stored().lists ?? {}
  const storedHidden = () => stored().hidden ?? []
  const cellTexts = () => cells().map(c => c.textContent)

  it('opens from the menu, seeded with every list the table ships', () => {
    renderApp()
    openAliases()

    expect($$('.alias-list').length).toBeGreaterThan(5)
    expect(wordsIn('pronouns')).toContain('they')
    // The two the table ships empty, listed so they can be filled in.
    expect(wordsIn('contacts')).toEqual([])
  })

  // Folded, the panel is a list of what it can offer — which is how somebody
  // finds the one they came for. `bodyparts` alone is fifty words to scroll
  // past otherwise.
  it('folds every list up, one open at a time', () => {
    renderApp()
    openAliases()

    const open = () => $$('.alias-list.is-open').map(l => l.getAttribute('aria-label'))
    // All of them closed on arrival: the panel is opened to reach one list out
    // of ten, and one already open is one the user has to fold away first.
    expect(open()).toEqual([])
    expect($$('.alias-word')).toHaveLength(0)

    openList('pronouns')
    expect(open()).toEqual(['pronouns'])
    // Folded means the words are out of the tree, not merely hidden: nine lists
    // left open would have a screen reader read out three hundred words nobody
    // asked for.
    expect(list('clothes').querySelectorAll('.alias-word')).toHaveLength(0)

    openList('clothes')
    expect(open()).toEqual(['clothes'])
    expect(list('pronouns').querySelectorAll('.alias-word')).toHaveLength(0)
  })

  // The same effect the guide's headings have: what was just chosen is the
  // first thing on screen rather than left below the fold.
  it('brings the list it opens to the top of the pane', () => {
    renderApp()
    openAliases()
    // Nothing opened itself, so nothing has moved yet.
    expect(scrolledIntoView.filter(el => el.classList.contains('alias-list'))).toEqual([])

    openList('clothes')
    expect(scrolledIntoView).toContain(list('clothes'))
  })

  it('closes the one that is open when it is chosen again', () => {
    renderApp()
    openAliases()
    openList('clothes')

    click(list('clothes').querySelector('.alias-list-head'))
    expect($$('.alias-list.is-open')).toHaveLength(0)
  })

  it('fills in a name phrase that was previously a blank', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    // `BLANK` is empty, so the unfilled phrase is its words and the gap after
    // them — the trailing space is where the name goes.
    expect(cellTexts()).toContain(`This is ${BLANK}`)

    openAliases()
    addTo('name.nickname', 'Ada')

    expect(cellTexts()).toContain('This is Ada')
    expect(cellTexts()).not.toContain(`This is ${BLANK}`)
  })

  it('adds a contact and offers it on the matching phrase', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    openAliases()
    addTo('contacts', 'Mum')

    expect(wordsIn('contacts')).toEqual(['Mum'])
    // A lone contact needs no picker — it goes straight into the phrase.
    expect(cellTexts().some(t => t?.includes('call Mum'))).toBe(true)
  })

  it('asks which contact once there is more than one', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    openAliases()
    addTo('contacts', 'Mum')
    addTo('contacts', 'Dad')
    click($('.panel-back'))
    // Leaving a panel puts the board back under a pointer that has not moved, so
    // the app is deaf for a second — to a click as much as to a dwell.
    act(() => void vi.advanceTimersByTime(SETTLE_MS))
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))

    const callCell = cells().find(c => /going to call/.test(c.textContent ?? ''))!
    click(callCell)

    expect($('.slot-picker')).not.toBeNull()
    expect($$('.slot-option').map(o => o.textContent)).toEqual(['Mum', 'Dad'])
    click($$('.slot-option')[1])
    expect(message()).toContain('Dad')
  })

  it('removes a word', () => {
    renderApp()
    openAliases()
    addTo('contacts', 'Mum')
    expect(wordsIn('contacts')).toEqual(['Mum'])

    editWords('contacts')
    click(list('contacts').querySelector('.alias-word .contact-remove'))
    expect(wordsIn('contacts')).toEqual([])
  })

  // Taking a word off a list the table ships is the edit that needs the store to
  // win outright: falling back to the shipped words would put it straight back.
  it('takes a word off a list the table ships, and keeps it off', () => {
    renderApp()
    openAliases()
    const before = wordsIn('pronouns')
    editWords('pronouns')
    click(list('pronouns').querySelector('.alias-word .contact-remove'))

    expect(wordsIn('pronouns')).toEqual(before.slice(1))
    expect(storedLists().pronouns).toEqual(before.slice(1))
  })

  it('refuses blank and duplicate words', () => {
    renderApp()
    openAliases()

    openList('contacts')
    click(list('contacts').querySelector('.contact-add-btn'))
    expect(wordsIn('contacts')).toEqual([])

    addTo('contacts', 'Mum')
    addTo('contacts', 'Mum')
    expect(wordsIn('contacts')).toEqual(['Mum'])
  })

  const panelTool = (label: string) =>
    [...$$('.alias-panel-tools .alias-tool')].find(t => (t.getAttribute('aria-label') ?? '').startsWith(label))!
  const nameField = (name: string) =>
    list(name).querySelector<HTMLInputElement>(`input[aria-label="Rename ${name}"]`)
  const rename = (from: string, to: string) => {
    fireEvent.change(nameField(from)!, { target: { value: to } })
    fireEvent.blur(nameField(from)!)
    settle()
  }

  // Extensible: a list of their own, reached by writing its name in a phrase.
  // The + cannot ask for a name — it is one dwell, and naming is a keyboard
  // job — so it makes one, opens it, and leaves the field ready to type in.
  it('adds a list, named for them and ready to be renamed', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))

    expect(storedLists()['new-list']).toEqual([])
    expect(nameField('new-list')).not.toBeNull()

    rename('new-list', 'Drinks')
    // Lower-cased, because that is how a slot looks one up.
    expect(storedLists().drinks).toEqual([])
    expect(storedLists()['new-list']).toBeUndefined()
  })

  // Without a name of its own the second one would land on the first, and the
  // panel would show one list where the user asked for two.
  it('gives a second new list a name of its own', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))
    click(panelTool('Add a list'))

    expect(Object.keys(storedLists()).sort()).toEqual(['new-list', 'new-list-2'])
  })

  it('keeps the words when a list is renamed', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))
    click(panelTool('Done editing'))
    addTo('new-list', 'tea')

    click(panelTool('Edit list names'))
    rename('new-list', 'drinks')

    expect(storedLists().drinks).toEqual(['tea'])
  })

  // Two lists called the same thing would be one list nobody could reach.
  it('refuses a name another list already has', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))
    rename('new-list', 'pronouns')

    expect(storedLists()['new-list']).toEqual([])
    expect(storedLists().pronouns).toBeUndefined()
  })

  it('deletes a list of its own', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))

    click(list('new-list').querySelector('[aria-label^="Delete"]'))
    expect($$('.alias-list').find(l => l.getAttribute('aria-label') === 'new-list')).toBeUndefined()
    expect(storedLists()['new-list']).toBeUndefined()
  })

  // One the table ships cannot go by being left out of the lists — the table
  // would put it straight back — so a removal is written down as its own fact.
  it('deletes a list the table ships, and it stays gone', () => {
    renderApp()
    openAliases()
    click(panelTool('Edit list names'))
    click(list('pronouns').querySelector('[aria-label^="Delete"]'))

    expect($$('.alias-list').find(l => l.getAttribute('aria-label') === 'pronouns')).toBeUndefined()
    expect(storedHidden()).toContain('pronouns')

    cleanup()
    renderApp()
    openAliases()
    expect($$('.alias-list').find(l => l.getAttribute('aria-label') === 'pronouns')).toBeUndefined()
  })

  // And the phrases that named it read as a blank rather than falling back to
  // the words that are no longer on the board. A slot with options draws its
  // label — "pronoun" — and one with none draws nothing at all.
  it('leaves the phrases that named a deleted list with nothing to offer', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    const usingPronouns = () => cells().filter(c => c.textContent?.includes('pronoun')).length
    expect(usingPronouns(), 'no phrase in the table uses {pronouns}').toBeGreaterThan(0)

    openAliases()
    click(panelTool('Edit list names'))
    click(list('pronouns').querySelector('[aria-label^="Delete"]'))

    expect(usingPronouns()).toBe(0)
  })

  // Deleting a list is the largest loss this panel hands out: fifty words in one
  // dwell, and every phrase that named it left with a blank. So it is the one
  // that most needs a way back.
  it('puts back a list it deleted, with its words', () => {
    renderApp()
    openAliases()
    click(panelTool('Add a list'))
    click(panelTool('Done editing'))
    addTo('new-list', 'tea')

    click(panelTool('Edit list names'))
    click(list('new-list').querySelector('[aria-label^="Delete"]'))
    expect(storedLists()['new-list']).toBeUndefined()

    click(panelTool('Put the new-list list back'))
    expect(storedLists()['new-list']).toEqual(['tea'])
  })

  // What goes back is the *state* the name was in, not the words that were on
  // show. Writing the table's own words into the store would pin the list to
  // this release and stop it following the table into the next one, which is the
  // whole point of keeping only what the user changed.
  it('puts back a list the table ships without storing a copy of it', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    renderApp()
    openAliases()
    click(panelTool('Edit list names'))
    click(list('pronouns').querySelector('[aria-label^="Delete"]'))
    expect(storedHidden()).toContain('pronouns')

    click(panelTool('Put the pronouns list back'))
    expect(storedHidden()).not.toContain('pronouns')
    expect(storedLists().pronouns, "the table's own words were copied into the store").toBeUndefined()

    // A heading is a name box while names are being edited, so leave that mode
    // before asking the list to open.
    click(panelTool('Done editing'))
    expect(wordsIn('pronouns')).toContain('they')
    // And the phrases that named it have their choices again.
    expect(cellTexts().filter(t => t?.includes('pronoun')).length).toBeGreaterThan(0)
  })

  // Quiet rather than away, and naming the list it would restore.
  it('has no list to put back until one is deleted', () => {
    renderApp()
    openAliases()

    expect(panelTool('Nothing to put back').getAttribute('aria-disabled')).toBe('true')
  })

  // Renaming one the table ships carries its words across and hides the old
  // name, which is the same removal written the same way.
  it('renames a list the table ships', () => {
    renderApp()
    openAliases()
    click(panelTool('Edit list names'))
    rename('pronouns', 'people')

    expect(storedLists().people).toContain('they')
    expect(storedHidden()).toContain('pronouns')
    expect($$('.alias-list').find(l => l.getAttribute('aria-label') === 'pronouns')).toBeUndefined()
  })

  // Two arrangements, the same pair the category tabs offer: A–Z, or the order
  // the words were put in. A–Z is a view — the order underneath it is left
  // alone, so going to A–Z and back is not a way to lose an arrangement.
  describe('the order the words come in', () => {
    const seed = seedDrinks
    const tool = (label: string) => {
      openList('drinks')
      return [...list('drinks').querySelectorAll('.alias-tool')].find(t =>
        (t.getAttribute('aria-label') ?? '').startsWith(label),
      )!
    }
    const chipFor = (word: string) => {
      openList('drinks')
      return [...list('drinks').querySelectorAll('.alias-word')].find(
        c => c.querySelector('.alias-word-text')?.textContent === word,
      )!
    }
    const chips = () => wordsIn('drinks')

    it('shows the order they were put in, until asked for A to Z', () => {
      seed(['tea', 'coffee', 'beer'])
      expect(chips()).toEqual(['tea', 'coffee', 'beer'])

      click(tool('Your own order'))
      expect(chips()).toEqual(['beer', 'coffee', 'tea'])

      // And the arrangement underneath is untouched.
      expect(JSON.parse(localStorage.getItem('peri_aliases')!).lists.drinks).toEqual(['tea', 'coffee', 'beer'])
    })

    it('remembers which arrangement is showing', () => {
      seed(['tea', 'coffee', 'beer'])
      click(tool('Your own order'))
      expect(localStorage.getItem('peri_alias_sort')).toBe('alpha')

      click(tool('Sorted A to Z'))
      expect(localStorage.getItem('peri_alias_sort')).toBe('custom')
      expect(chips()).toEqual(['tea', 'coffee', 'beer'])
    })

    // One dwell picks a word up, a second on another drops it there — the
    // gesture the category tabs and the emergency bar both use, because a
    // pointer-drag needs a button held down while the pointer moves.
    it('arranges by picking a word up and putting it down', () => {
      seed(['tea', 'coffee', 'beer'])
      click(tool('Arrange'))

      click(chipFor('beer'))
      expect(chipFor('beer').className).toMatch(/is-held/)
      click(chipFor('tea'))

      expect(chips()).toEqual(['beer', 'tea', 'coffee'])
      expect(JSON.parse(localStorage.getItem('peri_aliases')!).lists.drinks).toEqual(['beer', 'tea', 'coffee'])
    })

    // Arranging while A–Z is showing captures the order that was on screen —
    // otherwise the move lands somewhere the user could not see.
    it('makes the shown order theirs when arranged out of A to Z', () => {
      seed(['tea', 'coffee', 'beer'])
      click(tool('Your own order')) // to A–Z: beer, coffee, tea
      click(tool('Arrange'))

      click(chipFor('tea'))
      click(chipFor('beer'))

      // The A–Z order with the move applied. Applied to the order underneath —
      // tea, coffee, beer — the same move would have landed on
      // ['coffee', 'beer', 'tea'], which is the point of the test.
      expect(JSON.parse(localStorage.getItem('peri_aliases')!).lists.drinks).toEqual(['tea', 'beer', 'coffee'])
      expect(localStorage.getItem('peri_alias_sort')).toBe('custom')
    })

    // A word chip is the remove control and the thing being moved, and it must
    // never be both at once: a dwell meant to put a word down would delete it.
    it('offers no remove while a list is being arranged', () => {
      seed(['tea', 'coffee'])
      editWords('drinks')
      expect(list('drinks').querySelector('.alias-word .contact-remove')).not.toBeNull()

      click(tool('Arrange'))
      expect(list('drinks').querySelector('.alias-word .contact-remove')).toBeNull()
      // And the mode it replaced has let go rather than sitting underneath it.
      expect(listTool('drinks', 'edit').getAttribute('aria-pressed')).toBe('false')
    })

    // Closing the list puts down whatever is in the air; without it the word
    // stays held across the round trip and the next dwell drops the forgotten
    // one instead of lifting the chip under the pointer.
    it('stops arranging when the list is closed', () => {
      seed(['tea', 'coffee'])
      click(tool('Arrange'))
      click(list('drinks').querySelector('.alias-list-head'))
      openList('drinks')

      expect(tool('Arrange').getAttribute('aria-pressed')).toBe('false')
    })
  })

  // A word is text to read until the pencil says otherwise. The × used to sit on
  // every chip in every state, which put a delete under the pointer of somebody
  // reading their own words — and a gaze that rests is a gaze that fires.
  describe('editing the words in a list', () => {
    const chipFor = (word: string) =>
      [...list('drinks').querySelectorAll('.alias-word')].find(
        c =>
          c.querySelector<HTMLInputElement>('.alias-word-name')?.value === word ||
          c.querySelector('.alias-word-text')?.textContent === word,
      )!
    const removeControl = (word: string) => chipFor(word).querySelector('.contact-remove')
    const reword = (from: string, to: string) => {
      const field = chipFor(from).querySelector('input')!
      fireEvent.change(field, { target: { value: to } })
      fireEvent.blur(field)
      settle()
    }
    const drinks = () => storedLists().drinks
    const undo = () => listTool('drinks', 'undo')

    it('offers nothing to delete until the pencil is on', () => {
      seedDrinks(['tea', 'coffee'])
      openList('drinks')
      expect(list('drinks').querySelectorAll('.contact-remove')).toHaveLength(0)

      editWords('drinks')
      expect(list('drinks').querySelectorAll('.contact-remove')).toHaveLength(2)
    })

    it('rewords a word where it stands', () => {
      seedDrinks(['tea', 'coffee', 'beer'])
      editWords('drinks')
      reword('coffee', 'cocoa')

      expect(drinks()).toEqual(['tea', 'cocoa', 'beer'])
    })

    // A word is what comes out of the speaker, so it is kept exactly as typed —
    // unlike a list's name, which is the key a slot looks up and is folded down.
    it('keeps the case a word is typed in', () => {
      seedDrinks(['mum'])
      editWords('drinks')
      reword('mum', 'Mum')

      expect(drinks()).toEqual(['Mum'])
    })

    // Two chips reading the same thing is one word nobody can tell from the
    // other, and a slot offering it twice.
    it('refuses a word the list already has', () => {
      seedDrinks(['tea', 'coffee'])
      editWords('drinks')
      reword('coffee', 'tea')

      expect(drinks()).toEqual(['tea', 'coffee'])
    })

    // Deleting is the one edit here with nothing to show for it afterwards: a
    // word that is gone leaves no chip to fix.
    it('puts the last deleted word back where it was', () => {
      seedDrinks(['tea', 'coffee', 'beer'])
      editWords('drinks')
      click(removeControl('coffee'))
      expect(drinks()).toEqual(['tea', 'beer'])

      click(undo())
      expect(drinks()).toEqual(['tea', 'coffee', 'beer'])
    })

    it('goes back through several deletions, newest first', () => {
      seedDrinks(['tea', 'coffee', 'beer'])
      editWords('drinks')
      click(removeControl('tea'))
      click(removeControl('beer'))
      expect(drinks()).toEqual(['coffee'])

      click(undo())
      expect(drinks()).toEqual(['coffee', 'beer'])
      click(undo())
      expect(drinks()).toEqual(['tea', 'coffee', 'beer'])
    })

    // Quiet rather than away with nothing to put back: a control that comes and
    // goes moves the three beside it, and these are aimed at rather than read.
    it('has nothing to put back until something is deleted', () => {
      seedDrinks(['tea', 'coffee'])
      editWords('drinks')
      expect(undo().getAttribute('aria-disabled')).toBe('true')

      click(removeControl('tea'))
      expect(undo().getAttribute('aria-disabled')).toBeNull()

      click(undo())
      expect(drinks()).toEqual(['tea', 'coffee'])
      expect(undo().getAttribute('aria-disabled')).toBe('true')
    })

    // The removal remembers where the word sat in the order underneath, not in
    // the one on show — otherwise an undo out of A–Z rearranges the list it is
    // meant to be repairing.
    it('puts a word back into the order underneath, not the one on show', () => {
      seedDrinks(['beer', 'tea', 'coffee'])
      click(listTool('drinks', 'sort')) // A–Z: beer, coffee, tea
      editWords('drinks')
      click(removeControl('coffee'))

      click(undo())
      // Taken from the shown order, coffee would have gone back at index 1.
      expect(drinks()).toEqual(['beer', 'tea', 'coffee'])
    })

    // Typed back in by hand in the meantime: the removal is spent either way,
    // and putting it back again would leave the word on the list twice.
    it('does not double a word that came back by hand', () => {
      seedDrinks(['tea'])
      editWords('drinks')
      click(removeControl('tea'))
      addTo('drinks', 'tea')

      click(undo())
      expect(drinks()).toEqual(['tea'])
    })

    // The two modes a chip can be in are never both on: a chip that is a field,
    // a delete and a handle at once is three targets in one place.
    it('puts down what arranging had in the air', () => {
      seedDrinks(['tea', 'coffee'])
      click(listTool('drinks', 'arrange'))
      click(chipFor('tea'))
      expect(chipFor('tea').className).toMatch(/is-held/)

      editWords('drinks')
      expect(listTool('drinks', 'arrange').getAttribute('aria-pressed')).toBe('false')

      click(listTool('drinks', 'arrange'))
      expect(list('drinks').querySelector('.is-held'), 'a word was still in the air').toBeNull()
    })

    // The part no keyboard supplies: saying *where* in the box to type. There is
    // no click in a gaze, so a rest over the field puts the caret under it — and
    // going on resting is how a gaze selects, since a dwell can only say "here".
    describe('placing the caret by dwell', () => {
      const dwellOn = (field: Element, at = 100) => {
        fireEvent.pointerEnter(field, { clientX: at, clientY: 100 })
        act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.actionDwellMs))
      }
      const rest = () => act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.actionDwellMs))
      const answers = (field: Element, offset: number) =>
        Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: field, offset }) })
      const range = (field: HTMLInputElement) => [field.selectionStart, field.selectionEnd]

      afterEach(() => {
        delete (document as unknown as Record<string, unknown>).caretPositionFromPoint
      })

      it('puts the caret in a word, then takes the word, then the lot', () => {
        seedDrinks(['tea and coffee'])
        editWords('drinks')
        const field = list('drinks').querySelector<HTMLInputElement>('.alias-word-name')!
        answers(field, 5)

        dwellOn(field)
        expect(document.activeElement, 'the field was left unfocused').toBe(field)
        expect(range(field), 'the first rest is a caret, not a selection').toEqual([5, 5])

        rest()
        expect(range(field)).toEqual([4, 7])

        rest()
        expect(range(field)).toEqual([0, 14])
      })

      // The same on a list's name, which is the other field this panel edits.
      it('puts the caret in a list name', () => {
        seedDrinks(['tea'])
        openAliases()
        click(panelTool('Edit list names'))
        const field = list('drinks').querySelector<HTMLInputElement>('.alias-name')!
        answers(field, 2)

        dwellOn(field)
        expect(range(field)).toEqual([2, 2])
      })
    })

    // Closing the list puts the mode away with it, exactly as it does arranging.
    it('stops editing when the list is closed', () => {
      seedDrinks(['tea', 'coffee'])
      editWords('drinks')
      click(list('drinks').querySelector('.alias-list-head'))
      openList('drinks')

      expect(listTool('drinks', 'edit').getAttribute('aria-pressed')).toBe('false')
    })
  })

  it('persists across a reload', () => {
    renderApp()
    openAliases()
    addTo('name.nickname', 'Ada')

    expect(storedLists()['name.nickname']).toEqual(['Ada'])
  })

  // Renaming a menu item must not lose somebody their contacts. The old panel
  // wrote a profile; this reads it once and carries it over.
  it('carries an old profile over the first time it loads', () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    localStorage.setItem(
      'dwellspeak_profile',
      JSON.stringify({ name: { given: 'Ada', surname: 'Lovelace', nickname: 'Ada' }, contacts: ['Mum'] }),
    )
    renderApp()

    expect(cellTexts().some(t => t?.includes('call Mum'))).toBe(true)
    expect(storedLists()).toMatchObject({ contacts: ['Mum'], name: ['Ada Lovelace'], 'name.nickname': ['Ada'] })
  })
})
