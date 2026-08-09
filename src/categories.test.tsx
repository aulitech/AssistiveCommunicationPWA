import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from './App'

// Category editing spans the filter bar, a modal and the phrase editor, so it
// gets its own file rather than swelling App.test.tsx further.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  fireEvent.click(el)
  settle()
}

function renderApp() {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  container = render(<App />).container
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const storedStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

const cells = () => $$('.phrase-cell')
const toggles = () => $$('.toggle-btn')
const enterEditMode = () => click(toggles()[1])
// The bar also holds add / sort / reorder buttons, which are role="button"
// rather than role="tab" — this keeps them out of the category list.
const tabs = () => $$('.filter-tab[role="tab"]')
const tabLabels = () => tabs().map(t => t.textContent)
const tabNamed = (name: string) => tabs().find(t => t.textContent === name)
const action = (label: string) => $$('.edit-action-btn').find(b => b.textContent?.includes(label))
const saveModal = () => click(action('Save'))
const type = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  settle()
}
const nameField = () => $('input[aria-label="Category name"]')!

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('outside edit mode', () => {
  it('offers no category editing at all', () => {
    renderApp()
    expect($('.add-category-tab')).toBeNull()
    expect(tabs()[1].getAttribute('aria-label')).not.toMatch(/rename/i)
  })
})

describe('in edit mode', () => {
  it('turns category tabs into rename targets', () => {
    renderApp()
    enterEditMode()
    expect($('.add-category-tab')).not.toBeNull()
    expect(tabs()[1].getAttribute('aria-label')).toMatch(/^Rename category:/)
  })

  it('leaves "All" alone, since it is not a category', () => {
    renderApp()
    enterEditMode()
    expect(tabs()[0].textContent).toBe('All')
    expect(tabs()[0].getAttribute('aria-label')).not.toMatch(/rename/i)
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
    expect(storedStore().categories).toEqual(['Physio'])
  })

  it('refuses a name another category already uses, whatever the casing', () => {
    renderApp()
    enterEditMode()
    const existing = tabs()[2].textContent!
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
    const original = tabs()[1].textContent!

    click(tabNamed(original))
    type(nameField(), 'Renamed')
    saveModal()

    expect(tabLabels()).toContain('Renamed')
    expect(tabLabels()).not.toContain(original)

    // The phrases followed rather than being orphaned under a vanished tab.
    click(toggles()[1]) // leave edit mode
    click(tabNamed('Renamed'))
    expect(cells().length).toBeGreaterThan(0)
  })

  it('follows the rename with the current filter', () => {
    renderApp()
    const original = tabs()[1].textContent!
    click(tabNamed(original)) // select it first
    enterEditMode()
    click(tabNamed(original))
    type(nameField(), 'Followed')
    saveModal()

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Followed')
  })

  it('survives being renamed twice', () => {
    renderApp()
    enterEditMode()
    const original = tabs()[1].textContent!

    click(tabNamed(original))
    type(nameField(), 'Once')
    saveModal()
    click(tabNamed('Once'))
    type(nameField(), 'Twice')
    saveModal()

    expect(tabLabels()).toContain('Twice')
    expect(tabLabels()).not.toContain('Once')
    expect(tabLabels()).not.toContain(original)
  })

  it('stores the rename against the source name, not per phrase', () => {
    renderApp()
    enterEditMode()
    const original = tabs()[1].textContent!
    click(tabNamed(original))
    type(nameField(), 'Mapped')
    saveModal()

    expect(storedStore().categoryRenames[original]).toBe('Mapped')
  })
})

describe('deleting a category', () => {
  it('deletes one that is empty', () => {
    renderApp()
    enterEditMode()
    click($('.add-category-tab'))
    type(nameField(), 'Temporary')
    saveModal()

    click(tabNamed('Temporary'))
    expect(action('Delete')).toBeDefined()
    click(action('Delete'))

    expect(tabLabels()).not.toContain('Temporary')
    expect(storedStore().categories).toEqual([])
  })

  // Deleting a populated category would take its phrases with it silently.
  it('refuses one that holds phrases, and says why', () => {
    renderApp()
    enterEditMode()
    click(tabs()[1])

    expect(action('Delete')).toBeUndefined()
    expect($('.edit-modal-note')?.textContent).toMatch(/will move with it/i)
  })
})

describe('the phrase editor', () => {
  it('files a phrase under a category invented on the spot', () => {
    renderApp()
    enterEditMode()
    click(cells()[0])
    type($('.edit-modal-text')!, 'A brand new phrase')
    type($('.edit-modal-select')!, ' __new_category__')

    const field = $('input[aria-label="New category name"]')
    expect(field).not.toBeNull()
    type(field!, 'Invented')
    saveModal()

    expect(tabLabels()).toContain('Invented')

    // The tab appearing proves only that the category exists. What matters is
    // that the phrase actually moved into it.
    click(toggles()[1]) // leave edit mode
    click(tabNamed('Invented'))
    expect(cells().map(c => c.textContent)).toEqual(['A brand new phrase'])
  })

  it('moves an existing phrase between existing categories', () => {
    renderApp()
    enterEditMode()
    const destination = tabs()[3].textContent!
    const moved = cells()[0].textContent!

    click(cells()[0])
    type($('.edit-modal-select')!, destination)
    saveModal()

    click(toggles()[1]) // leave edit mode
    click(tabNamed(destination))
    expect(cells().map(c => c.textContent)).toContain(moved)
  })

  it('will not save a new category with no name', () => {
    renderApp()
    enterEditMode()
    click(cells()[0])
    type($('.edit-modal-text')!, 'Some phrase')
    type($('.edit-modal-select')!, ' __new_category__')

    expect(action('Save')?.className).toMatch(/is-disabled/)
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
  const names = () => tabLabels().slice(1) // "All" is not a category

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
  it('keeps the toolbar to two controls in either mode', () => {
    renderApp()
    enterEditMode()
    expect($$('.filter-bar-tools .filter-bar-btn')).toHaveLength(2)
    click(reorderBtn())
    expect($$('.filter-bar-tools .filter-bar-btn')).toHaveLength(2)
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
      localStorage.setItem(STORE_KEY, JSON.stringify({ categoryOrder: ['Food', 'Feelings'] }))
      renderApp()
      expect(names().slice(0, 2)).toEqual(['Food', 'Feelings'])
    })
  })

  it('leaves "All" pinned first and unmovable', () => {
    renderApp()
    startReordering()
    expect(tabLabels()[0]).toBe('All')
    expect(tabs()[0].getAttribute('draggable')).toBeNull()

    const arranged = names()
    dwellDrag(arranged[arranged.length - 1], arranged[0])
    expect(tabLabels()[0]).toBe('All')
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
    click(tabNamed(target))
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
    click(tabNamed('Temporary'))
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
    click(tabs()[1])
    expect($('.edit-modal')?.getAttribute('aria-label')).toBe('Rename category')
  })

  it('reorders rather than renames while reordering is on', () => {
    renderApp()
    startReordering()
    click(tabs()[1])
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
    click(toggles()[1]) // leave edit mode
    enterEditMode()
    expect(sortBtn()).toBeNull()
    expect($('.add-category-tab')).not.toBeNull()
  })
})

describe('a category that runs out of phrases', () => {
  // Deleting the last phrase in a category takes its tab away. The filter still
  // named it, which left the grid empty under a tab that no longer existed and
  // no way back to it.
  it('falls back to All rather than leaving an empty grid', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ custom: [{ id: 'custom-solo', text: 'Only one', category: 'Solo' }] }),
    )
    renderApp()

    click(tabNamed('Solo'))
    expect(cells().map(c => c.textContent)).toEqual(['Only one'])

    enterEditMode()
    click(cells()[0])
    click(action('Delete'))

    expect(tabNamed('Solo')).toBeUndefined()
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    expect(cells().length).toBeGreaterThan(1)
  })
})
