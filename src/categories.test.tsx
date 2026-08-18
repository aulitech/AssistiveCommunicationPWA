import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App'
import { DEFAULT_SETTINGS } from './core/store'

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

function renderApp() {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  container = render(<App />).container
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const storedStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

const cells = () => $$('.phrase-cell')
const editToggle = () => $('.edit-toggle')
const enterEditMode = () => click(editToggle())
// The bar also holds add / sort / reorder buttons, which are role="button"
// rather than role="tab" — this keeps them out of the category list.
const tabs = () => $$('.filter-tab[role="tab"]')
const tabLabels = () => tabs().map(t => t.textContent)
// "Sent" and "All" lead the bar and are not categories. Everything about
// renaming, deleting and ordering is about what comes after them.
const FIXED_TABS = 2
const catTabs = () => tabs().slice(FIXED_TABS)
const catLabels = () => catTabs().map(t => t.textContent)
const tabNamed = (name: string) => tabs().find(t => t.textContent === name)
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
const iconBtn = (label: string) => $$<HTMLButtonElement>('.icon-btn').find(b => b.getAttribute('aria-label') === label)
const writePhrase = (value: string) => type(box(), value)
const savePhrase = () => click(iconBtn('Save phrase'))
const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const pickerBtn = (label: string) =>
  inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)
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
  it('turns category tabs into rename targets', () => {
    renderApp()
    enterEditMode()
    expect($('.add-category-tab')).not.toBeNull()
    expect(catTabs()[0].getAttribute('aria-label')).toMatch(/^Rename category:/)
  })

  it('leaves the tabs that are not categories alone', () => {
    renderApp()
    enterEditMode()
    expect(tabLabels().slice(0, FIXED_TABS)).toEqual(['Sent', 'All'])
    for (const tab of tabs().slice(0, FIXED_TABS)) {
      expect(tab.getAttribute('aria-label')).not.toMatch(/rename/i)
    }
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

    click(tabNamed(original))
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
    click(tabNamed(original))
    type(nameField(), 'Followed')
    saveModal()

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Followed')
  })

  it('survives being renamed twice', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!

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
    const original = catTabs()[0].textContent!
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
    click(catTabs()[0])

    expect(action('Delete')).toBeUndefined()
    expect($('.edit-modal-note')?.textContent).toMatch(/will move with it/i)
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

  it('leaves "Sent" and "All" pinned first and unmovable', () => {
    renderApp()
    startReordering()
    expect(tabLabels().slice(0, FIXED_TABS)).toEqual(['Sent', 'All'])
    for (const tab of tabs().slice(0, FIXED_TABS)) expect(tab.getAttribute('draggable')).toBeNull()

    const arranged = names()
    dwellDrag(arranged[arranged.length - 1], arranged[0])
    expect(tabLabels().slice(0, FIXED_TABS)).toEqual(['Sent', 'All'])
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
    click(catTabs()[0])
    expect($('.edit-modal')?.getAttribute('aria-label')).toBe('Rename category')
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
    click(iconBtn('Delete phrase'))

    expect(tabNamed('Solo')).toBeUndefined()
    expect(tabNamed('All')?.getAttribute('aria-selected')).toBe('true')
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

    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    // Width alone would take the arrows off a tablet in portrait as well.
    expect(css).toMatch(/@media \(max-width: 700px\) and \(orientation: portrait\) \{\s*\.filter-arrow-end \{\s*display: none;/)
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
