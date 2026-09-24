import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { stylesheet } from '../stylesheet'

// Category editing spans the filter bar, the rename dialog and the editor strip
// under the message box, so it gets its own file rather than swelling
// App.test.tsx further.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  fireEvent.click(el)
  settle()
}

// The board opens in auto-speak, whatever was stored, and these tests are about
// composing and editing — so each render switches out of it, which is two
// dwells on the edit toggle: auto-speak → edit → composing.
function renderApp() {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  // Everything Peri ships is in Library, and ordering, renaming and moving
  // between tabs need more than one — so the board is given three of its own,
  // unless the test has put a store there itself.
  if (localStorage.getItem(STORE_KEY) === null) localStorage.setItem(STORE_KEY, JSON.stringify(SEEDED))
  localStorage.removeItem('dwellspeak_settings')
  container = render(<App />).container
  settle()
  click(editToggle())
  click(editToggle())
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const SEEDED = {
  custom: [
    ['Tea please', 'Drinks'],
    ['Coffee please', 'Drinks'],
    ['Water please', 'Drinks'],
    ['Toast and jam', 'Food'],
    ['Soup of the day', 'Food'],
    ['Hiya there', 'Greetings'],
    ['Lovely to see you', 'Greetings'],
    ['Time for bed', 'Evening'],
  ].map(([text, category], i) => ({ id: `custom-seed-${i}`, text, category })),
}
const storedStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

const cells = () => $$('.phrase-cell')
const editToggle = () => $('.edit-toggle')
const enterEditMode = () => click(editToggle())
// The bar also holds add / sort / reorder buttons, which are role="button"
// rather than role="tab" — this keeps them out of the category list.
const tabs = () => $$('.filter-tab[role="tab"]')
const tabLabels = () => tabs().map(t => t.textContent)
// "Sent" and "All" lead the bar, "Translations" closes it, and none of the three
// is a category. Everything about renaming, deleting and ordering is about what
// sits between them.
const LEADING_TABS = 2
const TRAILING_TABS = 1
const catTabs = () => tabs().slice(LEADING_TABS, -TRAILING_TABS)
const catLabels = () => catTabs().map(t => t.textContent)
/** The three that are not categories, in the order the bar holds them. */
const pinnedTabs = () => [...tabs().slice(0, LEADING_TABS), ...tabs().slice(-TRAILING_TABS)]
const pinnedLabels = () => pinnedTabs().map(t => t.textContent)
const tabNamed = (name: string) => tabs().find(t => t.textContent === name)
const renameBtn = () => $('.rename-category-tab')
/** Goes to a category and opens it for renaming: the pencil acts on the tab that is showing. */
const renameTab = (name: string) => {
  click(tabNamed(name))
  click(renameBtn())
}
const action = (label: string) => $$('.edit-action-btn').find(b => b.textContent?.includes(label))
const saveModal = () => click(action('Save'))
const type = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  settle()
}
const nameField = () => $('input[aria-label="Category name"]')!

// A phrase is edited in the message box now, and filed from a grid rather than
// from a `<select>` — a native select opens a list the operating system draws,
// which is the one control on this screen a dwell cannot reach.
const box = () => $<HTMLTextAreaElement>('.text-display')!
const iconBtn = (label: string) =>
  $$<HTMLButtonElement>('.icon-btn').find(b => b.getAttribute('aria-label') === label)
const writePhrase = (value: string) => type(box(), value)
const savePhrase = () => click(iconBtn('Save phrase'))
const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const pickerBtn = (label: string) =>
  inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)
/** Ticks or unticks each of these in the editor's category grid, then Done. */
const toggleCategories = (...names: string[]) => {
  click($('.category-trigger'))
  for (const name of names)
    click(inDoc('.picker-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === name))
  click(pickerBtn('Done'))
}
const chooseCategory = (name: string) => {
  click($('.category-trigger'))
  click(inDoc('.picker-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === name))
  // "New category…" closes the grid by itself, to ask for the name.
  const done = pickerBtn('Done')
  if (done) click(done)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('outside edit mode', () => {
  it('offers no category editing at all', () => {
    renderApp()
    expect($('.add-category-tab')).toBeNull()
    expect(catTabs()[0].getAttribute('aria-label')).not.toMatch(/rename/i)
  })
})

describe('in edit mode', () => {
  /**
   * **A tab goes to its category in every mode.** It opened the category for
   * renaming in edit mode, which left edit mode unable to move between
   * categories at all — editing a phrase under another tab meant leaving the
   * mode, going there and coming back.
   */
  it('goes to a category from its tab', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[1].textContent!

    click(tabNamed(name))

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe(name)
    expect($('.edit-modal'), 'the tab opened for renaming').toBeNull()
  })

  it('renames the tab that is showing with the pencil among the tools', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[1].textContent!

    click(tabNamed(name))

    expect(renameBtn()?.getAttribute('aria-label')).toBe(`Rename category: ${name}`)
    click(renameBtn())
    expect($('.edit-modal')?.getAttribute('aria-label')).toBe('Rename category')
  })

  // All and the three records are not categories. The pencil goes quiet on
  // them rather than away: the tools are aimed at by position.
  it('goes quiet on a tab that is not a category', () => {
    renderApp()
    enterEditMode()

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Library')
    expect(renameBtn()?.getAttribute('aria-disabled')).toBe('true')
    expect(renameBtn()?.getAttribute('aria-label')).toMatch(/holds every phrase, so it cannot be renamed/i)
    click(renameBtn())
    expect($('.edit-modal')).toBeNull()
  })

  it('offers no pencil outside edit mode', () => {
    renderApp()
    expect(renameBtn()).toBeNull()
  })
})

describe('adding a category', () => {
  it('creates one that persists before it holds any phrases', () => {
    renderApp()
    enterEditMode()
    click($('.add-category-tab'))
    type(nameField(), 'Physio')
    saveModal()

    expect(tabLabels()).toContain('Physio')
    expect(storedStore().members.Physio).toEqual([])
  })

  it('refuses a name another category already uses, whatever the casing', () => {
    renderApp()
    enterEditMode()
    const existing = catTabs()[1].textContent!
    click($('.add-category-tab'))
    type(nameField(), existing.toUpperCase())

    expect($('.edit-modal-note')?.textContent).toMatch(/already called/i)
    expect(action('Save')?.className).toMatch(/is-disabled/)
  })

  it('refuses an empty name', () => {
    renderApp()
    enterEditMode()
    click($('.add-category-tab'))
    type(nameField(), '   ')
    expect(action('Save')?.className).toMatch(/is-disabled/)
  })
})

describe('renaming a category', () => {
  it('renames a built-in category and takes its phrases with it', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!

    renameTab(original)
    type(nameField(), 'Renamed')
    saveModal()

    expect(tabLabels()).toContain('Renamed')
    expect(tabLabels()).not.toContain(original)

    // The phrases followed rather than being orphaned under a vanished tab.
    click(editToggle()) // leave edit mode
    click(tabNamed('Renamed'))
    expect(cells().length).toBeGreaterThan(0)
  })

  it('follows the rename with the current filter', () => {
    renderApp()
    const original = catTabs()[0].textContent!
    click(tabNamed(original)) // select it first
    enterEditMode()
    click(renameBtn())
    type(nameField(), 'Followed')
    saveModal()

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Followed')
  })

  it('survives being renamed twice', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!

    renameTab(original)
    type(nameField(), 'Once')
    saveModal()
    click(renameBtn())
    type(nameField(), 'Twice')
    saveModal()

    expect(tabLabels()).toContain('Twice')
    expect(tabLabels()).not.toContain('Once')
    expect(tabLabels()).not.toContain(original)
  })

  // A category is its references, so they go with its name, in their order.
  it('takes its phrases, in their order, to the new name', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!
    click(tabNamed(original))
    const held = cells().map(c => c.getAttribute('data-phrase'))
    click(renameBtn())
    type(nameField(), 'Mapped')
    saveModal()

    expect(storedStore().members.Mapped).toEqual(held)
    expect(storedStore().members).not.toHaveProperty(original)
  })
})

describe('deleting a category', () => {
  /** A pointer aimed somewhere new, which is what the question waits for. */
  const moveAway = (x = 700) => {
    fireEvent.pointerMove(document.body, { clientX: x, clientY: 500 })
    settle()
  }
  const confirmDelete = () => {
    click(action('Delete'))
    moveAway()
    click(action('Delete'))
  }
  const question = () => $('.edit-modal[role="alertdialog"]')

  it('deletes one that is empty, once asked', () => {
    renderApp()
    enterEditMode()
    click($('.add-category-tab'))
    type(nameField(), 'Temporary')
    saveModal()

    renameTab('Temporary')
    confirmDelete()

    expect(tabLabels()).not.toContain('Temporary')
    expect(storedStore().members).not.toHaveProperty('Temporary')
  })

  it('offers to delete one that holds phrases, and asks first, saying how many go with it', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    renameTab(name)
    const count = cells().length
    expect(action('Delete')).toBeDefined()

    click(action('Delete'))

    expect(question()?.getAttribute('aria-label')).toBe(`Delete ${name}`)
    expect(question()?.textContent).toContain(`Delete ${name}?`)
    expect($('.edit-modal-note')?.textContent).toContain(`${count} phrase`)
    // Asking changed nothing.
    expect(tabLabels()).toContain(name)
    expect(storedStore().hidden ?? []).toEqual([])
  })

  // The dialog changes under a pointer resting where Delete was, so the delete
  // that confirms is at the far end and nothing arms until the pointer moves.
  it('puts the delete that confirms at the far end, and waits for the pointer to move', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    renameTab(name)
    click(action('Delete'))

    const buttons = $$('.edit-action-btn').map(b => b.textContent)
    expect(buttons).toEqual(['Keep it', 'Delete'])

    fireEvent.click(action('Delete')!)
    settle()
    expect(tabLabels()).toContain(name)

    moveAway()
    click(action('Delete'))
    expect(tabLabels()).not.toContain(name)
  })

  it('keeps it, back in the rename dialog, on Keep it', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    renameTab(name)
    click(action('Delete'))
    moveAway()
    click(action('Keep it'))

    expect(question()).toBeNull()
    expect(nameField()).toBeTruthy()
    expect(tabLabels()).toContain(name)
    expect(storedStore().hidden ?? []).toEqual([])
  })

  // A category only ever referred to Library's phrases, so deleting one
  // deletes nothing anybody said.
  it('leaves every phrase in it in Library, and says so', () => {
    renderApp()
    enterEditMode()
    renameTab('Food')
    confirmDelete()

    expect(tabLabels()).not.toContain('Food')
    expect(storedStore().custom.map((c: { text: string }) => c.text)).toEqual(
      expect.arrayContaining(['Toast and jam', 'Soup of the day']),
    )
    expect(storedStore().hidden ?? []).toEqual([])
    expect($('.toast')?.textContent).toBe('Deleted Food — its 2 phrases are still in Library')
  })

  // Library is where every phrase lives, so it is neither renamed nor deleted.
  it('offers nothing to delete Library with', () => {
    renderApp()
    enterEditMode()
    click(tabNamed('Library'))
    expect(renameBtn()?.getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps a phrase open in the box, in the categories it has left', () => {
    renderApp()
    enterEditMode()
    click(tabNamed('Food'))
    click(cells()[0])
    const opened = box().value
    expect(opened).not.toBe('')

    click(renameBtn())
    confirmDelete()

    expect(box().value).toBe(opened)
    expect($('.category-trigger .picker-trigger-label')?.textContent).toBe('Library only')
  })

  // Filed there by hand, rather than following the tab: the draft holds the
  // name itself, and has to be told it has gone.
  it('keeps new words being filed under it, and finds them another home', () => {
    renderApp()
    enterEditMode()
    const filed = () => $('.category-trigger .picker-trigger-label')?.textContent
    writePhrase('Not yet saved')
    chooseCategory('Food')
    expect(filed()).toBe('Food')

    click(tabNamed('Food'))
    click(renameBtn())
    confirmDelete()

    expect(box().value).toBe('Not yet saved')
    expect(filed()).not.toBe('Food')
    expect(filed()).toBeTruthy()
  })
})

// A category goes with its last phrase: a tab that opens onto a blank grid is
// one more thing to read past. One made a moment ago and not yet filled stays.
describe('a category left with nothing in it', () => {
  const ONE = {
    ...SEEDED,
    custom: [...SEEDED.custom, { id: 'custom-solo', text: 'Only me in here', category: 'Solo' }],
    categories: ['Drinks', 'Food', 'Greetings', 'Solo'],
    categoryOrder: ['Solo', 'Drinks', 'Food', 'Greetings'],
    categorySort: 'custom',
  }
  const openSolo = () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(ONE))
    renderApp()
    enterEditMode()
    click(tabNamed('Solo'))
    click(cells().find(c => c.textContent === 'Only me in here'))
  }

  // On a category the bin takes the phrase out of it; the last one out takes
  // the category with it.
  it('goes when its last phrase is taken out', () => {
    openSolo()
    click(iconBtn('Take out of Solo'))

    expect(tabLabels()).not.toContain('Solo')
    expect(storedStore().members).not.toHaveProperty('Solo')
    expect(storedStore().categoryOrder).not.toContain('Solo')
    // Taken out, not deleted: it is still in Library.
    expect(storedStore().custom.map((c: { id: string }) => c.id)).toContain('custom-solo')
  })

  // On Library the bin deletes the phrase, from every category it was in.
  it('goes when its last phrase is deleted from Library', () => {
    openSolo()
    click(tabNamed('Library'))
    click(iconBtn('Delete phrase'))

    expect(tabLabels()).not.toContain('Solo')
    expect(storedStore().custom.map((c: { id: string }) => c.id)).not.toContain('custom-solo')
  })

  it('comes back where it was when the removal is undone', () => {
    openSolo()
    click(iconBtn('Take out of Solo'))
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith('Undo deleting')))

    expect(catLabels()[0]).toBe('Solo')
    expect(storedStore().members.Solo).toEqual(['custom-solo'])
    expect(storedStore().categoryOrder[0]).toBe('Solo')
  })

  it('comes back, with the phrase in it, when a delete on Library is undone', () => {
    openSolo()
    click(tabNamed('Library'))
    click(iconBtn('Delete phrase'))
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith('Undo deleting')))

    expect(catLabels()[0]).toBe('Solo')
    expect(storedStore().members.Solo).toEqual(['custom-solo'])
  })

  it('goes when its last phrase is moved out', () => {
    openSolo()
    // Out of Solo and into Drinks, which the grid does as two ticks.
    toggleCategories('Solo', 'Drinks')
    click(iconBtn('Save phrase'))

    expect(tabLabels()).not.toContain('Solo')
    expect(storedStore().members).not.toHaveProperty('Solo')
    expect(storedStore().members.Drinks).toContain('custom-solo')
  })

  // Ticking a second category adds to the first rather than replacing it.
  it('puts a phrase in a second category and keeps it in the first', () => {
    openSolo()
    toggleCategories('Drinks')
    click(iconBtn('Save phrase'))

    expect(storedStore().members.Solo).toEqual(['custom-solo'])
    expect(storedStore().members.Drinks).toContain('custom-solo')
  })

  // Reworded, a phrase keeps its place in each category it stays in.
  it('keeps a reworded phrase where it was in its category', () => {
    openSolo()
    click(tabNamed('Drinks'))
    const before = cells().map(c => c.getAttribute('data-phrase'))
    click(cells()[0])
    writePhrase('Tea please, strong')
    click(iconBtn('Save phrase'))

    expect(storedStore().members.Drinks).toEqual(before)
  })

  it('stays while it still has a phrase in it', () => {
    openSolo()
    click(tabNamed('Drinks'))
    click(cells()[0])
    click(iconBtn('Take out of Drinks'))

    expect(tabLabels()).toContain('Drinks')
  })

  // Made first and filled afterwards, which is why an empty one is ever kept.
  it('leaves one made a moment ago, and not yet filled, when a phrase goes elsewhere', () => {
    openSolo()
    click($('.add-category-tab'))
    type(nameField(), 'Not yet')
    saveModal()
    click(tabNamed('Drinks'))
    click(cells()[0])
    click(iconBtn('Take out of Drinks'))

    expect(tabLabels()).toContain('Not yet')
  })
})

describe('the phrase editor', () => {
  it('files a phrase under a category invented on the spot', () => {
    renderApp()
    enterEditMode()
    click(cells()[0])
    writePhrase('A brand new phrase')

    // The grid's last tile is not a category: it asks for one, in the same
    // dialog the category tabs use to add theirs.
    chooseCategory('New category…')
    expect(nameField()).not.toBeNull()
    type(nameField(), 'Invented')
    saveModal()
    savePhrase()

    expect(tabLabels()).toContain('Invented')

    // The tab appearing proves only that the category exists. What matters is
    // that the phrase actually moved into it.
    click(editToggle()) // leave edit mode
    click(tabNamed('Invented'))
    expect(cells().map(c => c.textContent)).toEqual(['A brand new phrase'])
  })

  it('moves an existing phrase between existing categories', () => {
    renderApp()
    enterEditMode()
    const destination = catTabs()[2].textContent!
    const moved = cells()[0].textContent!

    click(cells()[0])
    chooseCategory(destination)
    savePhrase()

    click(editToggle()) // leave edit mode
    click(tabNamed(destination))
    expect(cells().map(c => c.textContent)).toContain(moved)
  })

  it('will not save a new category with no name', () => {
    renderApp()
    enterEditMode()
    click(cells()[0])
    writePhrase('Some phrase')
    chooseCategory('New category…')

    expect(action('Save')?.className).toMatch(/is-disabled/)
  })

  // Nothing closes on a save, because nothing was opened. The editor going back
  // to a blank phrase is the only sign it happened, so it has to be reliable.
  it('leaves a phrase filed where it was put', () => {
    renderApp()
    enterEditMode()
    const destination = catTabs()[2].textContent!

    writePhrase('Somewhere particular')
    chooseCategory(destination)
    savePhrase()

    click(editToggle()) // leave edit mode
    click(tabNamed(destination))
    expect(cells().map(c => c.textContent)).toContain('Somewhere particular')
  })
})

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('ordering categories', () => {
  const reorderBtn = () => $('.reorder-tab')
  const sortBtn = () => $('.sort-order-tab')
  const startReordering = () => {
    enterEditMode()
    click(reorderBtn())
  }
  /** Pick a tab up by dwell, then drop it on another. */
  const dwellDrag = (from: string, to: string) => {
    click(tabNamed(from))
    click(tabNamed(to))
  }
  /** The same move by mouse, which is a native HTML5 drag. */
  const mouseDrag = (from: string, to: string) => {
    fireEvent.dragStart(tabNamed(from)!)
    settle()
    fireEvent.dragOver(tabNamed(to)!)
    fireEvent.drop(tabNamed(to)!)
    settle()
  }
  const names = catLabels

  it('is alphabetical to begin with', () => {
    renderApp()
    expect(names()).toEqual([...names()].sort())
    expect(storedStore().categoryOrder ?? []).toEqual([])
  })

  it('offers no reorder control outside edit mode', () => {
    renderApp()
    expect(reorderBtn()).toBeNull()
  })

  it('offers one in edit mode', () => {
    renderApp()
    enterEditMode()
    expect(reorderBtn()).not.toBeNull()
    // Sorting is only on offer once reordering, where it makes sense.
    expect(sortBtn()).toBeNull()
    click(reorderBtn())
    expect(sortBtn()).not.toBeNull()
  })

  // These used to sit in with the tabs, where reaching them meant scrolling to
  // the end of a bar that can be dozens of categories long.
  it('parks every category control outside the scroller, where none can scroll away', () => {
    renderApp()
    enterEditMode()
    expect($('.filter-scroll .filter-bar-btn')).toBeNull()
    expect($('.filter-bar-tools .add-category-tab')).not.toBeNull()
    expect($('.filter-bar-tools .reorder-tab')).not.toBeNull()

    click(reorderBtn())
    expect($('.filter-scroll .filter-bar-btn')).toBeNull()
    expect($('.filter-bar-tools .sort-order-tab')).not.toBeNull()
  })

  // Add and sort share a slot, so the toolbar does not change width — and with
  // it the reorder button's position — as the mode is toggled.
  // Three — add or sort, the pencil, reorder — and three either way: the tools
  // are aimed at by position, and one that came and went would move the rest.
  it('keeps the toolbar to three controls in either mode', () => {
    renderApp()
    enterEditMode()
    expect($$('.filter-bar-tools .filter-bar-btn')).toHaveLength(3)
    click(reorderBtn())
    expect($$('.filter-bar-tools .filter-bar-btn')).toHaveLength(3)
  })

  it('leaves no empty toolbar outside edit mode', () => {
    renderApp()
    expect($('.filter-bar-tools')).toBeNull()
  })

  it('moves a category by dwelling it and then its destination', () => {
    renderApp()
    startReordering()
    const [first, , third] = names()

    dwellDrag(first, third)

    expect(names().indexOf(first)).toBe(names().indexOf(third) + 1)
  })

  it('moves a category by mouse drag', () => {
    renderApp()
    startReordering()
    const [first, , third] = names()

    mouseDrag(first, third)

    expect(names().indexOf(first)).toBe(names().indexOf(third) + 1)
  })

  it('moves leftwards as well as rightwards', () => {
    renderApp()
    startReordering()
    const before = names()
    const last = before[before.length - 1]

    dwellDrag(last, before[0])

    expect(names()[0]).toBe(last)
  })

  it('persists the order and restores it on reload', () => {
    renderApp()
    startReordering()
    const [first, , third] = names()
    dwellDrag(first, third)
    const arranged = names()

    expect(storedStore().categoryOrder).toEqual(arranged)

    container = render(<App />).container
    settle()
    expect(names()).toEqual(arranged)
  })

  it('puts a lifted category back when dwelled a second time', () => {
    renderApp()
    startReordering()
    const before = names()

    click(tabNamed(before[1])) // lift
    expect(tabNamed(before[1])?.className).toMatch(/is-held/)
    click(tabNamed(before[1])) // and put down

    expect(names()).toEqual(before)
    expect(storedStore().categoryOrder ?? []).toEqual([])
  })

  // Switching to A–Z must not be a way to lose an arrangement someone built by
  // hand, a tab at a time.
  describe('the A–Z toggle', () => {
    it('goes to alphabetical and back to their own order', () => {
      renderApp()
      startReordering()
      const alphabetical = names()
      dwellDrag(alphabetical[0], alphabetical[2])
      const arranged = names()
      expect(arranged).not.toEqual(alphabetical)

      click(sortBtn())
      expect(names()).toEqual(alphabetical)

      click(sortBtn())
      expect(names()).toEqual(arranged)
    })

    it('keeps their order in the store while A–Z is showing', () => {
      renderApp()
      startReordering()
      const alphabetical = names()
      dwellDrag(alphabetical[0], alphabetical[2])
      const arranged = names()

      click(sortBtn())

      expect(storedStore().categorySort).toBe('alpha')
      expect(storedStore().categoryOrder).toEqual(arranged)
    })

    it('survives a reload in whichever arrangement is showing', () => {
      renderApp()
      startReordering()
      const alphabetical = names()
      dwellDrag(alphabetical[0], alphabetical[2])
      const arranged = names()
      click(sortBtn())

      container = render(<App />).container
      settle()
      expect(names()).toEqual(alphabetical)

      enterEditMode()
      click(reorderBtn())
      click(sortBtn())
      expect(names()).toEqual(arranged)
    })

    // Three cues for the same fact, because neither arrangement is "off" and
    // the green fill alone cannot say which one is on.
    it('says which arrangement is on, and which way it will go', () => {
      renderApp()
      startReordering()
      const arranged = names()
      dwellDrag(arranged[0], arranged[2])

      expect(sortBtn()?.getAttribute('aria-label')).toBe('Your own order. Switch to A to Z')
      expect(sortBtn()?.getAttribute('aria-pressed')).toBe('false')
      const custom = sortBtn()?.querySelector('svg')?.innerHTML

      click(sortBtn())

      expect(sortBtn()?.getAttribute('aria-label')).toBe('Sorted A to Z. Switch to your own order')
      expect(sortBtn()?.getAttribute('aria-pressed')).toBe('true')
      expect(sortBtn()?.querySelector('svg')?.innerHTML).not.toBe(custom)
    })

    it('does nothing until there is an order of their own to come back to', () => {
      renderApp()
      startReordering()
      expect(sortBtn()?.getAttribute('aria-disabled')).toBe('true')

      const arranged = names()
      dwellDrag(arranged[0], arranged[2])
      expect(sortBtn()?.getAttribute('aria-disabled')).toBeNull()
    })

    // Rearranging while A–Z is showing is building a new order, not editing the
    // old one — so it replaces it, and switches back to showing it.
    it('replaces their order when they rearrange from alphabetical', () => {
      renderApp()
      startReordering()
      const alphabetical = names()
      dwellDrag(alphabetical[0], alphabetical[2])
      const first = names()
      click(sortBtn())

      dwellDrag(alphabetical[1], alphabetical[3])

      expect(names()).not.toEqual(first)
      expect(names()).not.toEqual(alphabetical)
      expect(storedStore().categorySort).toBe('custom')
      expect(storedStore().categoryOrder).toEqual(names())
    })

    // Anyone who reordered before the toggle existed has an order and no flag.
    it('shows the order of a store written before the flag existed', () => {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...SEEDED, categoryOrder: ['Greetings', 'Food'] }))
      renderApp()
      expect(names().slice(0, 2)).toEqual(['Greetings', 'Food'])
    })
  })

  /**
   * Two pinned at the front and one at the end. The end one is the reason this
   * is worth asserting twice over: a custom order that could reach it would put
   * a tab after the last thing a user learns to look at.
   */
  it('leaves the three tabs that are not categories pinned and unmovable', () => {
    renderApp()
    startReordering()
    expect(pinnedLabels()).toEqual(['Sent', 'Library', 'Translations'])
    for (const tab of pinnedTabs()) expect(tab.getAttribute('draggable')).toBeNull()

    const arranged = names()
    dwellDrag(arranged[arranged.length - 1], arranged[0])
    expect(pinnedLabels()).toEqual(['Sent', 'Library', 'Translations'])
  })

  // Renames are stored against the source name, so the order — stored against
  // the shown name — has to be carried along or the category jumps to the end.
  it('keeps a renamed category in its place', () => {
    renderApp()
    startReordering()
    const arranged = names()
    dwellDrag(arranged[0], arranged[2])
    const moved = names()
    const target = moved[1]
    const at = names().indexOf(target)

    click(reorderBtn()) // back to renaming
    renameTab(target)
    type(nameField(), 'Renamed')
    saveModal()

    expect(names().indexOf('Renamed')).toBe(at)
  })

  it('drops a deleted category out of the stored order', () => {
    renderApp()
    enterEditMode()
    click($('.add-category-tab'))
    type(nameField(), 'Temporary')
    saveModal()

    click(reorderBtn())
    const arranged = names()
    dwellDrag(arranged[0], arranged[2])
    expect(storedStore().categoryOrder).toContain('Temporary')

    click(reorderBtn())
    renameTab('Temporary')
    click(action('Delete'))
    fireEvent.pointerMove(document.body, { clientX: 700, clientY: 500 })
    click(action('Delete'))

    expect(storedStore().categoryOrder).not.toContain('Temporary')
  })

  it('files a category added later at the end, without disturbing the order', () => {
    renderApp()
    startReordering()
    const arranged = names()
    dwellDrag(arranged[0], arranged[2])
    const before = names()

    click(reorderBtn()) // leave reorder mode to reach the add button
    click($('.add-category-tab'))
    type(nameField(), 'Aardvark') // alphabetically first, to prove it is not sorted in
    saveModal()

    expect(names()).toEqual([...before, 'Aardvark'])
  })

  it('renames rather than reorders once reordering is switched off', () => {
    renderApp()
    startReordering()
    click(reorderBtn())
    renameTab(catTabs()[0].textContent!)
    expect($('.edit-modal')?.getAttribute('aria-label')).toBe('Rename category')
  })

  // Renaming mid-arrangement would drop whatever is in the air. On a real
  // category, so the tab showing is not what keeps it quiet.
  it('keeps the pencil quiet while reordering', () => {
    renderApp()
    enterEditMode()
    click(tabNamed(catTabs()[0].textContent!))
    expect(renameBtn()?.getAttribute('aria-disabled'), 'the pencil was quiet before reordering').toBeNull()

    click(reorderBtn())

    expect(renameBtn()?.getAttribute('aria-disabled')).toBe('true')
  })

  it('reorders rather than renames while reordering is on', () => {
    renderApp()
    startReordering()
    click(catTabs()[0])
    expect($('.edit-modal')).toBeNull()
  })

  // Holding a category must be unmistakable, and must not rest on colour
  // alone — so the held tab, every other tab, and the live region each say it.
  describe('the cue that something is held', () => {
    it('marks the held tab and every other as somewhere to drop it', () => {
      renderApp()
      startReordering()
      const [first, second] = names()

      click(tabNamed(first))

      expect(tabNamed(first)?.className).toMatch(/is-held/)
      expect(tabNamed(first)?.className).not.toMatch(/is-drop-zone/)
      expect(tabNamed(second)?.className).toMatch(/is-drop-zone/)
    })

    it('announces the lift, since styling says nothing aloud', () => {
      renderApp()
      startReordering()
      const [first] = names()

      click(tabNamed(first))

      expect($('.toast')?.textContent).toContain(first)
      expect($('[role="status"]')).not.toBeNull()
    })

    it('clears every trace of it once dropped', () => {
      renderApp()
      startReordering()
      const [first, , third] = names()

      dwellDrag(first, third)

      expect($('.is-held')).toBeNull()
      expect($('.is-drop-zone')).toBeNull()
    })

    it('says what dwelling each tab would now do', () => {
      renderApp()
      startReordering()
      const [first, second] = names()
      expect(tabNamed(first)?.getAttribute('aria-label')).toBe(`Move ${first}`)

      click(tabNamed(first))

      expect(tabNamed(first)?.getAttribute('aria-label')).toMatch(/^Holding /)
      expect(tabNamed(second)?.getAttribute('aria-label')).toBe(`Drop ${first} here`)
    })
  })

  // Leaving reorder mode with a tab in the air used to leave it there. Coming
  // back, the next dwell would drop the forgotten tab instead of lifting the
  // one under the pointer.
  it('empties its hands when reordering is switched off', () => {
    renderApp()
    startReordering()
    const before = names()

    click(tabNamed(before[1])) // lift
    click(reorderBtn()) // leave reorder mode holding it
    click(reorderBtn()) // and come back

    click(tabNamed(before[2]))
    expect(names()).toEqual(before)
    expect(tabNamed(before[2])?.className).toMatch(/is-held/)
  })

  it('does not stay armed after edit mode is left and re-entered', () => {
    renderApp()
    startReordering()
    click(editToggle()) // leave edit mode
    enterEditMode()
    expect(sortBtn()).toBeNull()
    expect($('.add-category-tab')).not.toBeNull()
  })
})

describe('a category that runs out of phrases', () => {
  // Deleting the last phrase in a category takes its tab away. The filter still
  // named it, which left the grid empty under a tab that no longer existed and
  // no way back to it.
  it('falls back to Library rather than leaving an empty grid', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ custom: [{ id: 'custom-solo', text: 'Only one', category: 'Solo' }] }),
    )
    renderApp()

    click(tabNamed('Solo'))
    expect(cells().map(c => c.textContent)).toEqual(['Only one'])

    enterEditMode()
    click(cells()[0])
    click(iconBtn('Take out of Solo'))

    expect(tabNamed('Solo')).toBeUndefined()
    expect(tabNamed('Library')?.getAttribute('aria-selected')).toBe('true')
    expect(cells().length).toBeGreaterThan(1)
  })
})

// The bar holds more categories than fit, and a dwell user has no wheel to bring
// the rest into view. It had a nudge and a jump to either end; the page is the
// step in between, and the one that maps to "show me the next lot".
describe('paging the category bar', () => {
  const arrow = (label: string) => $$('.filter-arrow').find(a => a.getAttribute('aria-label') === label)

  /** jsdom lays nothing out, so the width a page is measured from is supplied. */
  const withWidth = (w: number) => {
    const scroller = $<HTMLElement>('.filter-scroll')!
    Object.defineProperty(scroller, 'clientWidth', { value: w, configurable: true })
    const scrollBy = vi.fn()
    scroller.scrollBy = scrollBy
    return scrollBy
  }

  // One nudge's worth stays on screen. Tabs are pills of every different width,
  // so a jump of exactly one screen can cut one in half at the edge — and half a
  // category is a target that can be hit meaning the one beside it.
  it('moves a screenful of tabs less one nudge, in both directions', () => {
    renderApp()
    const scrollBy = withWidth(700)

    click(arrow('Next page of categories'))
    expect(scrollBy).toHaveBeenCalledWith({ left: 500, behavior: 'smooth' })

    click(arrow('Previous page of categories'))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -500, behavior: 'smooth' })
  })

  it('still moves when the bar is narrower than the overlap', () => {
    renderApp()
    const scrollBy = withWidth(150)

    click(arrow('Next page of categories'))
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
  })

  // Outermost is the biggest jump, so the three are told apart by where they sit
  // as well as by their glyphs — one chevron nudges, two move a page, a chevron
  // against a bar goes to the end.
  it('orders the controls by how far they travel', () => {
    renderApp()
    const labels = $$('.filter-arrow').map(a => a.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Go to first category',
      'Previous page of categories',
      'Scroll categories left',
      'Scroll categories right',
      'Next page of categories',
      'Go to last category',
    ])
  })

  // A phone held upright has no room for six arrows and the tools besides, so the
  // two that go all the way are hidden there — paging reaches either end too,
  // only a screen at a time, and nothing else nudges.
  //
  // This can only check that the rule is written and that the arrows it names are
  // the right two. jsdom applies no cascade and lays nothing out, so whether the
  // rule *takes effect* is a question for the deploy preview.
  it('hides the home and end arrows on a phone held upright', () => {
    renderApp()
    const named = $$('.filter-arrow-end').map(a => a.getAttribute('aria-label'))
    expect(named).toEqual(['Go to first category', 'Go to last category'])

    const css = stylesheet()
    // Width alone would take the arrows off a tablet in portrait as well.
    expect(css).toMatch(
      /@media \(max-width: 700px\) and \(orientation: portrait\) \{\s*\.filter-arrow-end \{\s*display: none;/,
    )
  })

  it('keeps paging while the pointer stays', () => {
    renderApp()
    const scrollBy = withWidth(700)

    fireEvent.pointerEnter(arrow('Next page of categories')!)
    act(() => void vi.advanceTimersByTime(800))
    expect(scrollBy).toHaveBeenCalledTimes(1)

    // Three more, at whatever the default pace is.
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.repeatDelayMs * 3))
    expect(scrollBy.mock.calls.length, 'the page control did not repeat').toBe(4)
  })
})
