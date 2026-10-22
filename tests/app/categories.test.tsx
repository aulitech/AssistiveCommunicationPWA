import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { stylesheet } from '../stylesheet'

// Category editing spans the filter bar, the rename dialog and the editor strip
// under the message box, so it gets its own file rather than swelling
// App.test.tsx further.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

/**
 * A pointer that travelled to what it is clicking, as a real one does — and as
 * the guard against the screen moving under a resting pointer needs, choosing a
 * phrase in edit mode holding everything until the pointer moves.
 */
let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

// The board opens in auto-speak, whatever was stored; a test about editing
// turns edit mode on, the only other way of working.
function renderApp() {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  // Everything Peri ships is in Library, and ordering, renaming and moving
  // between tabs need more than one — so the board is given three of its own,
  // unless the test has put a store there itself.
  if (localStorage.getItem(STORE_KEY) === null) localStorage.setItem(STORE_KEY, JSON.stringify(SEEDED))
  localStorage.removeItem('dwellspeak_settings')
  container = render(<App />).container
  settle()
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
const speakToggle = () => $('.autospeak-toggle')
const enterEditMode = () => click(speakToggle())
// The bar also holds add / sort / reorder buttons, which are role="button"
// rather than role="tab" — this keeps them out of the category list.
const tabs = () => $$('.filter-tab[role="tab"]')
const tabLabels = () => tabs().map(t => t.textContent)
// "Translations" and "Library" lead the bar, and neither is a category.
// Everything about renaming, deleting and ordering is about what comes after
// them.
const LEADING_TABS = 2
const catTabs = () => tabs().slice(LEADING_TABS)
const catLabels = () => catTabs().map(t => t.textContent)
/** The two that are not categories, in the order the bar holds them. */
const pinnedTabs = () => tabs().slice(0, LEADING_TABS)
const pinnedLabels = () => pinnedTabs().map(t => t.textContent)
const tabNamed = (name: string) => tabs().find(t => t.textContent === name)
/** The tab showing's own tools, in edit mode. */
/** The name of the tab showing, which a rest makes a field. */
const tabName = () => $('.tab-name')
const reorderTool = () => $('.reorder-tool')
const deleteTool = () => $('.delete-tool')
/** Goes to a category, if it is not the one showing, and opens its name for renaming. */
const renameTab = (name: string) => {
  const showing = tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent
  if (showing !== name) click(tabNamed(name))
  click(tabName())
}
/** Renames a category where it stands: its name, the new one typed, and Enter. */
const renameTo = (from: string, to: string) => {
  renameTab(from)
  type(nameField(), to)
  fireEvent.keyDown(nameField(), { key: 'Enter' })
  settle()
}
/** The bin on the tab showing, which only asks. */
const askToDelete = (name: string) => {
  renameTab(name)
  click(deleteTool())
}
const action = (label: string) =>
  [...document.body.querySelectorAll<HTMLElement>('.edit-action-btn')].find(b => b.textContent?.includes(label))
const saveModal = () => click(action('Save'))
const type = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  settle()
}
const nameField = () => $<HTMLInputElement>('input[aria-label="Category name"]')!

// A phrase is edited in the message box now, and filed from a grid rather than
// from a `<select>` — a native select opens a list the operating system draws,
// which is the one control on this screen a dwell cannot reach.
const box = () => $<HTMLTextAreaElement>('.text-display')!
const iconBtn = (label: string) =>
  $$<HTMLButtonElement>('.icon-btn').find(b => b.getAttribute('aria-label') === label)
const writePhrase = (value: string) => type(box(), value)
/**
 * **The bin on the phrase open in the box**, and the question it asks first.
 * What the question said comes back, since what the bin does depends on the tab.
 */
const deleteOpen = () => {
  click($('.cell-tools .delete-tool'))
  const asked = document.body.querySelector<HTMLElement>('[role="alertdialog"]')?.textContent ?? ''
  click([...document.body.querySelectorAll<HTMLElement>('.edit-action-btn.danger')][0])
  return asked
}
const savePhrase = () => click(iconBtn('Save phrase'))
const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
const pickerBtn = (label: string) =>
  inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/**
 * **The tabs work the same in every mode.** Adding, renaming, arranging and
 * taking a category away were edit mode's alone; the tabs are the board's own
 * arrangement rather than a phrase being changed, so they are there while the
 * board speaks too.
 */
describe('outside edit mode', () => {
  it('offers the same tools as edit mode', () => {
    renderApp()
    expect($('.filter-tabs > .add-tab')).not.toBeNull()
    const name = catTabs()[0].textContent!
    click(tabNamed(name))
    expect($('.tab-name')?.getAttribute('aria-label')).toBe(`Rename ${name}`)
  })

  it('adds a category', () => {
    renderApp()
    click($('.add-tab'))
    type(nameField(), 'While talking')
    saveModal()
    expect(catLabels()).toContain('While talking')
  })
})

// **The tab that is showing is part of the board under it**: the board's own
// ground and a green edge along its top, not the whole tab filled. Filled, it
// was louder than Speak, the one control the fill is kept to mean. The moment
// of choosing one still flashes full.
describe('the tab that is showing', () => {
  const rule = (selector: string) => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const at = css.indexOf(`\n${selector} {`)
    return css.slice(at, css.indexOf('}', at))
  }

  // **Only the tab showing has a ground**; the others' names are a step dimmer
  // than the muted grey. And no rule between the top row and the tabs.
  it('is the only tab with a ground, the others a step dimmer', () => {
    expect(rule('.filter-tabs .filter-tab')).toMatch(/background: *transparent/)
    expect(rule('.filter-tabs .filter-tab')).toMatch(/color: *#a6a6a6/)
    expect(rule('.filter-tab.active')).toMatch(/background: *var\(--panel\)/)
    expect(rule('.topbar'), 'a rule under the top row').not.toMatch(/border-bottom/)
    expect(rule('.topbar'), 'a ground on the top row').not.toMatch(/background/)
    expect(rule('.filter-bar-wrap'), 'a ground on the tab bar').not.toMatch(/background/)
  })

  // **Edit mode is said on the panel's edge**, in a muted green — the tab
  // showing's sides and top and the table's border — and not on the phrases.
  it("turns the panel's edge green in edit mode, and leaves the phrases alone", () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    const green = 'color-mix\\(in srgb, var\\(--accent\\) \\d+%, var\\(--panel-edge\\)\\)'
    expect(css).toMatch(new RegExp(`\\.app\\.edit-mode \\.grid-area \\{ border-color: ${green}; \\}`))
    const tab = css.match(/\.app\.edit-mode \.filter-tabs \.filter-tab\.active \{([^}]*)\}/)![1]!
    for (const side of ['top', 'left', 'right']) expect(tab).toMatch(new RegExp(`border-${side}-color: ${green};`))
    expect(tab, 'its foot, which opens it into the table').not.toMatch(/border-bottom/)
    const cells = css.match(/\.app\.edit-mode \.phrase-cell\.edit-mode,[^{]*\{([^}]*)\}/)![1]!
    expect(cells, 'an outline on every phrase').not.toMatch(/outline/)
  })

  // **The tab showing and the phrase table are one panel**: one ground, one
  // edge, the tab covering the panel's top edge where they meet — and the
  // phrases a step lighter than both.
  it('shares its ground and edge with the phrase table', () => {
    expect(rule('.grid-area')).toMatch(/background: *var\(--panel\)/)
    expect(rule('.filter-tab.active')).toMatch(/border-color: *var\(--panel-edge\)/)
    expect(rule('.grid-area')).toMatch(/border: *1px solid var\(--panel-edge\)/)
    expect(rule('.grid-area'), "the table's corners are square").toMatch(/border-radius: *12px/)
    expect(rule('.filter-tabs .filter-tab.active')).toMatch(/border-bottom: *1px solid var\(--panel\)/)
    const token = (name: string) =>
      stylesheet()
        .match(new RegExp(`--${name}: *([^;]+);`))![1]!
        .trim()
    expect(token('panel')).toBe('var(--surface)')
    const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16)
    expect(lightness(token('cell')), 'the phrases are not lighter than the table').toBeGreaterThan(
      lightness(token('surface')),
    )
  })

  // **Its foot flares into the table, as a Chrome tab does** — a concave curve
  // at each bottom corner in the table's ground and edge — and the first tab
  // runs straight down into the table's side, that corner squared. Whether it
  // looks seamless is an eye's question and `e2e/layout.spec.ts`'s; this is
  // that the rules are written.
  it("flares its foot into the table, Chrome's way, the first tab on a square corner", () => {
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/\.filter-tabs \.filter-tab\.active \{[^}]*z-index: *1;/)
    for (const side of ['before', 'after']) {
      const flare = [
        ...css.matchAll(new RegExp(`\\.filter-tabs \\.filter-tab\\.active::${side} \\{([^}]*)\\}`, 'g')),
      ]
        .map(m => m[1])
        .join('\n')
      expect(flare).toMatch(/radial-gradient\([^;]*var\(--tab-seam\)[^;]*var\(--panel\)/)
    }
    expect(css).toMatch(/\.filter-tabs > \.filter-tab\.active:first-child::before \{ *display: *none; *\}/)
    expect(css).toMatch(
      /:has\(\.filter-tabs > \.filter-tab\.active:first-child\) \+ \.grid-area \{[^}]*border-top-left-radius: *0/,
    )
    expect(css, 'the flares do not take the green edge in edit mode').toMatch(
      /\.app\.edit-mode \.filter-tabs \.filter-tab\.active \{[^}]*--tab-seam: *color-mix/,
    )
  })

  it('is not filled in the accent, though the flash of choosing it is', () => {
    expect(rule('.filter-tab.active')).toMatch(/background: *var\(--panel\)/)
    expect(rule('.filter-tab.active')).not.toMatch(/var\(--accent\)/)
    expect(rule('.filter-tab.flashed')).toMatch(/background: *var\(--accent\);/)
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

  // **The tab showing carries its own tools**, in edit mode: its name, which
  // renames it, and reorder. There is no pencil.
  it('makes the name of the tab showing rename it, and puts a reorder tool beside it', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[1].textContent!

    click(tabNamed(name))

    const showing = tabNamed(name)!
    expect(showing.querySelector('.tab-name')?.getAttribute('aria-label')).toBe(`Rename ${name}`)
    expect(showing.querySelector('.hide-tool')?.getAttribute('aria-label')).toBe(`Hide ${name} from the bar`)
    expect(showing.querySelector('.reorder-tool')?.getAttribute('aria-label')).toBe(`Move ${name}`)
    expect([...showing.querySelectorAll('.tab-tool')], 'more than the eye and the reorder tool').toHaveLength(2)
    expect($$('.filter-tab[role="tab"] .tab-tools'), 'tools on a tab that is not showing').toHaveLength(1)
    // Selected, and not disabled: that would say so of the tools too.
    expect(showing.getAttribute('aria-disabled')).toBeNull()
  })

  // Library holds every phrase, and the records are records: none is a
  // category to rename or move — but every tab can be taken off the bar.
  it('puts only the eye on a tab that is not a category', () => {
    renderApp()
    enterEditMode()

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Library')
    expect($$('.filter-tabs > .filter-tab .tab-tool').map(t => t.getAttribute('aria-label'))).toEqual([
      'Hide Library from the bar',
    ])
    expect($('.tab-name')).toBeNull()
  })

  it('offers them outside edit mode too', () => {
    renderApp()
    click(tabNamed(catTabs()[0].textContent!))
    expect($('.tab-tools')).not.toBeNull()
  })

  // **Adding one is right after the last tab**, as a browser's new tab button
  // is; the controls that stood at the end of the bar are gone.
  it('puts adding a category right after the last tab', () => {
    renderApp()
    enterEditMode()
    const row = [...$('.filter-tabs')!.children].filter(el => !el.classList.contains('filter-tabs-measure'))
    expect(row.at(-1)?.getAttribute('aria-label')).toBe('Add category')
    expect(row.at(-2)?.getAttribute('role')).toBe('tab')
    expect($('.filter-bar-tools, .rename-category-tab, .reorder-tab, .sort-order-tab')).toBeNull()
  })

  // **Only where there is a row worth arranging**: five tabs on the bar or
  // more. Translations, Library and three of its own is five.
  it('shows the drag pad with five tabs on the bar, and not with four', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ custom: SEEDED.custom.filter(p => ['Drinks', 'Food'].includes(p.category)) }),
    )
    renderApp()
    enterEditMode()
    click(tabNamed('Food'))
    expect(tabs()).toHaveLength(4)
    expect(reorderTool(), 'a drag pad with four tabs').toBeNull()
    expect(tabName(), 'renaming went with it').not.toBeNull()
    expect(tabNamed('Food')?.getAttribute('aria-disabled'), 'its name marked disabled with it').toBeNull()

    click($('.add-tab'))
    type(nameField(), 'Third')
    saveModal()
    expect(tabs()).toHaveLength(5)
    expect(reorderTool()).not.toBeNull()
  })

  // The reorder tool is a drag pad: six dots, the mark of something to pick up.
  it('draws the reorder tool as a drag pad', () => {
    renderApp()
    enterEditMode()
    click(tabNamed(catTabs()[0].textContent!))
    expect(reorderTool()!.querySelectorAll('svg circle')).toHaveLength(6)
  })
})

describe('adding a category', () => {
  it('creates one that persists before it holds any phrases', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))
    type(nameField(), 'Physio')
    saveModal()

    expect(tabLabels()).toContain('Physio')
    expect(storedStore().members.Physio).toEqual([])
  })

  it('refuses a name another category already uses, whatever the casing', () => {
    renderApp()
    enterEditMode()
    const existing = catTabs()[1].textContent!
    click($('.add-tab'))
    type(nameField(), existing.toUpperCase())

    expect(document.body.querySelector<HTMLElement>('.edit-modal-note')?.textContent).toMatch(/already called/i)
    expect(action('Save')?.className).toMatch(/is-disabled/)
  })

  it('refuses an empty name', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))
    type(nameField(), '   ')
    expect(action('Save')?.className).toMatch(/is-disabled/)
  })
})

/**
 * **Renamed where it stands.** The pencil makes the name a field and the
 * reorder tool a bin, the only control on it then. Enter saves it, and so does
 * going to another tab, leaving edit mode or the field losing the caret;
 * Escape puts it back as it was.
 */
describe('renaming a category', () => {
  it('makes the name a field, and the bin its only control', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!

    renameTab(name)

    expect(nameField().value).toBe(name)
    expect(nameField().closest('.filter-tab')?.getAttribute('aria-selected')).toBe('true')
    expect(reorderTool()).toBeNull()
    expect(deleteTool()?.getAttribute('aria-label')).toBe(`Delete ${name}`)
    const tab = nameField().closest('.filter-tab')!
    expect([...tab.querySelectorAll('[role="button"]')], 'another control on the tab').toEqual([deleteTool()])
  })

  it('renames a built-in category and takes its phrases with it', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!

    renameTo(original, 'Renamed')

    expect(tabLabels()).toContain('Renamed')
    expect(tabLabels()).not.toContain(original)
    expect($('.toast')?.textContent).toBe(`Renamed ${original} to Renamed`)

    // The phrases followed rather than being orphaned under a vanished tab.
    click(speakToggle()) // leave edit mode
    click(tabNamed('Renamed'))
    expect(cells().length).toBeGreaterThan(0)
  })

  it('follows the rename with the current filter', () => {
    renderApp()
    enterEditMode()
    renameTo(catTabs()[0].textContent!, 'Followed')

    expect(tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent).toBe('Followed')
  })

  it('saves with Enter as well', () => {
    renderApp()
    enterEditMode()
    renameTab(catTabs()[0].textContent!)
    type(nameField(), 'Entered')
    fireEvent.keyDown(nameField(), { key: 'Enter' })
    settle()

    expect(tabLabels()).toContain('Entered')
  })

  it('puts the name back on Escape', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    renameTab(name)
    type(nameField(), 'Never mind')
    fireEvent.keyDown(nameField(), { key: 'Escape' })
    settle()

    expect(tabLabels()).toContain(name)
    expect(tabLabels()).not.toContain('Never mind')
    expect($('input[aria-label="Category name"]')).toBeNull()
  })

  // Another category's name is a clash, whatever the casing, and nothing is
  // no name: either keeps the name it had.
  it("keeps the name it had for another category's, or for nothing", () => {
    renderApp()
    enterEditMode()
    const [name, other] = catLabels()

    renameTo(name!, other!.toUpperCase())
    expect(catLabels()).toContain(name)

    renameTo(name!, '   ')
    expect(catLabels()).toContain(name)
  })

  it('survives being renamed twice', () => {
    renderApp()
    enterEditMode()
    const original = catTabs()[0].textContent!

    renameTo(original, 'Once')
    renameTo('Once', 'Twice')

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

    renameTo(original, 'Mapped')

    expect(storedStore().members.Mapped).toEqual(held)
    expect(storedStore().members).not.toHaveProperty(original)
  })

  // There is no control to save it with: the field is the name itself.
  it('saves the name on going to another tab', () => {
    renderApp()
    enterEditMode()
    const [name, other] = catLabels()
    renameTab(name!)
    type(nameField(), 'Moved on')

    click(tabNamed(other!))

    expect(catLabels()).toContain('Moved on')
    expect(catLabels()).not.toContain(name)
    expect($('input[aria-label="Category name"]')).toBeNull()
  })

  // The tabs work the same in either mode, so changing it changes nothing here.
  it('carries on renaming across a change of mode, and saves on losing the caret', () => {
    renderApp()
    enterEditMode()
    const [name] = catLabels()
    renameTab(name!)
    type(nameField(), 'Left with')

    click(speakToggle())
    expect(nameField().value).toBe('Left with')

    fireEvent.blur(nameField())
    settle()
    expect(catLabels()).toContain('Left with')
  })

  it('saves the name when the field loses the caret', () => {
    renderApp()
    enterEditMode()
    const [name] = catLabels()
    renameTab(name!)
    type(nameField(), 'Blurred')

    fireEvent.blur(nameField())
    settle()

    expect(catLabels()).toContain('Blurred')
  })

  // The bin, then the question: the name being typed is not saved first.
  it('does not save a half-typed name on the way to the bin', () => {
    renderApp()
    enterEditMode()
    const [name] = catLabels()
    renameTab(name!)
    type(nameField(), 'Half done')

    click(deleteTool())

    expect(catLabels()).toContain(name)
    expect(document.body.querySelector<HTMLElement>('.edit-modal[role="alertdialog"]')?.textContent).toContain(
      `Delete ${name}?`,
    )
  })
})

/**
 * **The bin on the tab showing**, while its name is a field, **asks first**:
 * it takes the category's order, which somebody may have spent a while on.
 */
describe('deleting a category', () => {
  /** A pointer aimed somewhere new, which is what the question waits for. */
  const moveAway = (x = 700) => {
    fireEvent.pointerMove(document.body, { clientX: x, clientY: 500 })
    settle()
  }
  const confirmDelete = () => {
    moveAway()
    click(action('Delete'))
  }
  const question = () => document.body.querySelector<HTMLElement>('.edit-modal[role="alertdialog"]')

  it('deletes one that is empty, once asked', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))
    type(nameField(), 'Temporary')
    saveModal()

    askToDelete('Temporary')
    confirmDelete()

    expect(tabLabels()).not.toContain('Temporary')
    expect(storedStore().members).not.toHaveProperty('Temporary')
  })

  it('asks first, saying how many phrases it holds', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    click(tabNamed(name))
    const count = cells().length

    askToDelete(name)

    expect(question()?.getAttribute('aria-label')).toBe(`Delete ${name}`)
    expect(question()?.textContent).toContain(`Delete ${name}?`)
    expect(document.body.querySelector<HTMLElement>('.edit-modal-note')?.textContent).toContain(`${count} phrase`)
    // Asking changed nothing.
    expect(tabLabels()).toContain(name)
    expect(storedStore().hidden ?? []).toEqual([])
  })

  // The question arrives under a pointer resting where the bin was, so the
  // delete that confirms is at the far end and nothing arms until the pointer
  // moves.
  it('puts the delete that confirms at the far end, and waits for the pointer to move', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    askToDelete(name)

    const buttons = [...document.body.querySelectorAll<HTMLElement>('.edit-action-btn')].map(b => b.textContent)
    expect(buttons).toEqual(['Keep it', 'Delete'])

    fireEvent.click(action('Delete')!)
    settle()
    expect(tabLabels()).toContain(name)

    moveAway()
    click(action('Delete'))
    expect(tabLabels()).not.toContain(name)
  })

  it('keeps it on Keep it', () => {
    renderApp()
    enterEditMode()
    const name = catTabs()[0].textContent!
    askToDelete(name)
    moveAway()
    click(action('Keep it'))

    expect(question()).toBeNull()
    expect(tabLabels()).toContain(name)
    expect(storedStore().hidden ?? []).toEqual([])
  })

  // A category only ever referred to Library's phrases, so deleting one
  // deletes nothing anybody said.
  it('leaves every phrase in it in Library, and says so', () => {
    renderApp()
    enterEditMode()
    askToDelete('Food')
    confirmDelete()

    expect(tabLabels()).not.toContain('Food')
    expect(storedStore().custom.map((c: { text: string }) => c.text)).toEqual(
      expect.arrayContaining(['Toast and jam', 'Soup of the day']),
    )
    expect(storedStore().hidden ?? []).toEqual([])
    expect($('.toast')?.textContent).toBe('Deleted Food — its 2 phrases are still in Library')
  })

  it('keeps a phrase open in the box, in the categories it has left', () => {
    renderApp()
    enterEditMode()
    click(tabNamed('Food'))
    click(cells()[0])
    const opened = box().value
    expect(opened).not.toBe('')

    askToDelete('Food')
    confirmDelete()

    expect(box().value).toBe(opened)
  })

  // Written on its tab, and the tab gone: Library is showing, so that is where
  // Save puts it.
  it('saves words being written on it into Library once it has gone', () => {
    renderApp()
    enterEditMode()
    click(tabNamed('Food'))
    writePhrase('Not yet saved')

    askToDelete('Food')
    confirmDelete()
    expect(box().value).toBe('Not yet saved')
    savePhrase()

    expect($('.toast')?.textContent).toBe('Added to Library')
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
    expect(deleteOpen()).toContain('Take it out of Solo?')

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
    // Library is thousands of phrases; changing its words brings it to the top.
    writePhrase('Only me in here, again')
    expect(deleteOpen()).toContain('Delete this phrase?')

    expect(tabLabels()).not.toContain('Solo')
    expect(storedStore().custom.map((c: { id: string }) => c.id)).not.toContain('custom-solo')
  })

  it('comes back where it was when the removal is undone', () => {
    openSolo()
    expect(deleteOpen()).toContain('Take it out of Solo?')
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith('Undo:')))

    expect(catLabels()[0]).toBe('Solo')
    expect(storedStore().members.Solo).toEqual(['custom-solo'])
    expect(storedStore().categoryOrder[0]).toBe('Solo')
  })

  it('comes back, with the phrase in it, when a delete on Library is undone', () => {
    openSolo()
    click(tabNamed('Library'))
    // Library is thousands of phrases; changing its words brings it to the top.
    writePhrase('Only me in here, again')
    expect(deleteOpen()).toContain('Delete this phrase?')
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith('Undo:')))

    expect(catLabels()[0]).toBe('Solo')
    expect(storedStore().members.Solo).toEqual(['custom-solo'])
  })

  // Saved on a second category's tab, it is added to it and kept in the first.
  it('puts a phrase in a second category and keeps it in the first', () => {
    openSolo()
    click(tabNamed('Drinks'))
    click(iconBtn('Save phrase'))

    expect(storedStore().members.Solo).toEqual(['custom-solo'])
    expect(storedStore().members.Drinks).toContain('custom-solo')
  })

  // Reworded, a phrase keeps its place in each category it stays in.
  it('keeps a reworded phrase where it was in its category', () => {
    openSolo()
    click(tabNamed('Drinks'))
    const before = cells().map(c => c.getAttribute('data-phrase'))
    // Another phrase opens into an empty box: the one open is put aside first.
    click(iconBtn('Start a new phrase'))
    click(cells()[0])
    writePhrase('Tea please, strong')
    click(iconBtn('Save phrase'))

    expect(storedStore().members.Drinks).toEqual(before)
  })

  it('stays while it still has a phrase in it', () => {
    openSolo()
    click(tabNamed('Drinks'))
    // Another phrase opens into an empty box: the one open is put aside first.
    click(iconBtn('Start a new phrase'))
    click(cells()[0])
    expect(deleteOpen()).toContain('Take it out of Drinks?')

    expect(tabLabels()).toContain('Drinks')
  })

  // Made first and filled afterwards, which is why an empty one is ever kept.
  it('leaves one made a moment ago, and not yet filled, when a phrase goes elsewhere', () => {
    openSolo()
    click($('.add-tab'))
    type(nameField(), 'Not yet')
    saveModal()
    click(tabNamed('Drinks'))
    click(iconBtn('Start a new phrase'))
    click(cells()[0])
    expect(deleteOpen()).toContain('Take it out of Drinks?')

    expect(tabLabels()).toContain('Not yet')
  })
})

/**
 * **Save files a phrase under the category whose tab is showing**: there is no
 * category to choose in the message card. See `into` in `talk/use-editor.ts`.
 */
describe('the phrase editor', () => {
  it('files a phrase under a category made a moment ago', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))
    type(nameField(), 'Invented')
    saveModal()
    click(tabNamed('Invented'))

    writePhrase('A brand new phrase')
    savePhrase()

    click(speakToggle()) // leave edit mode
    click(tabNamed('Invented'))
    expect(cells().map(c => c.textContent)).toEqual(['A brand new phrase'])
  })

  // Opened off Library and saved on a category's tab, it is filed there too.
  it('adds an existing phrase to the category showing', () => {
    renderApp()
    enterEditMode()
    const destination = catTabs()[2].textContent!
    const moved = cells()[0].textContent!

    click(cells()[0])
    click(tabNamed(destination))
    savePhrase()

    click(speakToggle()) // leave edit mode
    click(tabNamed(destination))
    expect(cells().map(c => c.textContent)).toContain(moved)
  })

  it('will not save a new category with no name', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))

    expect(action('Save')?.className).toMatch(/is-disabled/)
  })

  // Nothing closes on a save, because nothing was opened. The editor going back
  // to a blank phrase is the only sign it happened, so it has to be reliable.
  it('leaves a phrase filed where it was put', () => {
    renderApp()
    enterEditMode()
    const destination = catTabs()[2].textContent!
    click(tabNamed(destination))

    writePhrase('Somewhere particular')
    savePhrase()

    expect(box().value).toBe('')
    click(speakToggle()) // leave edit mode
    click(tabNamed(destination))
    expect(cells().map(c => c.textContent)).toContain('Somewhere particular')
  })

  it('offers no category to choose in the message card', () => {
    renderApp()
    enterEditMode()
    expect($('.category-trigger')).toBeNull()
  })
})

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * **A tab is moved by its own reorder tool**: on the tab showing, in edit mode,
 * it lifts the tab — blue, and every other category somewhere to drop it — and
 * a dwell on another drops it there. The tool again puts it back. A mouse can
 * drag one onto another too.
 */
describe('ordering categories', () => {
  /** Goes to a category and lifts it by its own tool. */
  const lift = (name: string) => {
    const showing = tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent
    if (showing !== name) click(tabNamed(name))
    click(reorderTool())
  }
  /** Lift a tab, then drop it on another. */
  const dwellDrag = (from: string, to: string) => {
    lift(from)
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

  it('moves a category by its reorder tool and then its destination', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = names()

    dwellDrag(first!, third!)

    expect(names().indexOf(first!)).toBe(names().indexOf(third!) + 1)
  })

  it('moves a category by mouse drag', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = names()

    mouseDrag(first!, third!)

    expect(names().indexOf(first!)).toBe(names().indexOf(third!) + 1)
  })

  it('moves leftwards as well as rightwards', () => {
    renderApp()
    enterEditMode()
    const before = names()
    const last = before[before.length - 1]!

    dwellDrag(last, before[0]!)

    expect(names()[0]).toBe(last)
  })

  it('persists the order and restores it on reload', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = names()
    dwellDrag(first!, third!)
    const arranged = names()

    expect(storedStore().categoryOrder).toEqual(arranged)

    container = render(<App />).container
    settle()
    expect(names()).toEqual(arranged)
  })

  it('puts a lifted category back when its reorder tool is rested on again', () => {
    renderApp()
    enterEditMode()
    const before = names()

    lift(before[1]!)
    expect(tabNamed(before[1]!)?.className).toMatch(/is-held/)
    expect(reorderTool()?.getAttribute('aria-label')).toBe(`Put ${before[1]} back where it was`)
    click(reorderTool())

    expect(names()).toEqual(before)
    expect($('.is-held')).toBeNull()
    expect(storedStore().categoryOrder ?? []).toEqual([])
  })

  // There is no A to Z control any more. A board left in A to Z shows it, and
  // moving a tab builds an order of its own from what is on screen.
  it('shows a board left in A to Z alphabetically, and moving a tab makes its own order', () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        ...SEEDED,
        categoryOrder: ['Greetings', 'Food', 'Drinks', 'Evening'],
        categorySort: 'alpha',
      }),
    )
    renderApp()
    const alphabetical = names()
    expect(alphabetical).toEqual([...alphabetical].sort())

    enterEditMode()
    dwellDrag(alphabetical[0]!, alphabetical[2]!)

    expect(storedStore().categorySort).toBe('custom')
    expect(storedStore().categoryOrder).toEqual(names())
  })

  // Anyone who reordered before the flag existed has an order and no flag.
  it('shows the order of a store written before the flag existed', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...SEEDED, categoryOrder: ['Greetings', 'Food'] }))
    renderApp()
    expect(names().slice(0, 2)).toEqual(['Greetings', 'Food'])
  })

  /**
   * **Both pinned at the front, Translations then Library**, and the custom
   * order reaching neither: dropping the last category on the first puts it
   * first among the categories, still after the two — which are never
   * somewhere to drop one, nor dragged.
   */
  it('leaves the two tabs that are not categories pinned at the front and unmovable', () => {
    renderApp()
    enterEditMode()
    expect(pinnedLabels()).toEqual(['Translations', 'Library'])
    for (const tab of pinnedTabs()) expect(tab.getAttribute('draggable')).toBeNull()

    const arranged = names()
    lift(arranged[arranged.length - 1]!)
    for (const tab of pinnedTabs()) expect(tab.className).not.toMatch(/is-drop-zone/)
    click(tabNamed(arranged[0]!))
    expect(pinnedLabels()).toEqual(['Translations', 'Library'])
    expect(catLabels()[0]).toBe(arranged[arranged.length - 1])
  })

  // Renames are stored against the source name, so the order — stored against
  // the shown name — has to be carried along or the category jumps to the end.
  it('keeps a renamed category in its place', () => {
    renderApp()
    enterEditMode()
    const arranged = names()
    dwellDrag(arranged[0]!, arranged[2]!)
    const target = names()[1]!
    const at = names().indexOf(target)

    renameTo(target, 'Renamed')

    expect(names().indexOf('Renamed')).toBe(at)
  })

  it('drops a deleted category out of the stored order', () => {
    renderApp()
    enterEditMode()
    click($('.add-tab'))
    type(nameField(), 'Temporary')
    saveModal()

    const arranged = names()
    dwellDrag(arranged[0]!, arranged[2]!)
    expect(storedStore().categoryOrder).toContain('Temporary')

    askToDelete('Temporary')
    fireEvent.pointerMove(document.body, { clientX: 700, clientY: 500 })
    click(action('Delete'))

    expect(storedStore().categoryOrder).not.toContain('Temporary')
  })

  it('files a category added later at the end, without disturbing the order', () => {
    renderApp()
    enterEditMode()
    const arranged = names()
    dwellDrag(arranged[0]!, arranged[2]!)
    const before = names()

    click($('.add-tab'))
    type(nameField(), 'Aardvark') // alphabetically first, to prove it is not sorted in
    saveModal()

    expect(names()).toEqual([...before, 'Aardvark'])
  })

  // Holding a category must be unmistakable, and must not rest on colour
  // alone — so the held tab, every other tab, and the live region each say it.
  describe('the cue that something is held', () => {
    it('marks the held tab and every other as somewhere to drop it', () => {
      renderApp()
      enterEditMode()
      const [first, second] = names()

      lift(first!)

      expect(tabNamed(first!)?.className).toMatch(/is-held/)
      expect(tabNamed(first!)?.className).not.toMatch(/is-drop-zone/)
      expect(tabNamed(second!)?.className).toMatch(/is-drop-zone/)
      expect(reorderTool()?.getAttribute('aria-pressed')).toBe('true')
    })

    it('announces the lift, since styling says nothing aloud', () => {
      renderApp()
      enterEditMode()
      const [first] = names()

      lift(first!)

      expect($('.toast')?.textContent).toContain(first)
      expect($('[role="status"]')).not.toBeNull()
    })

    it('clears every trace of it once dropped', () => {
      renderApp()
      enterEditMode()
      const [first, , third] = names()

      dwellDrag(first!, third!)

      expect($('.is-held')).toBeNull()
      expect($('.is-drop-zone')).toBeNull()
    })

    it('says what dwelling each tab would now do', () => {
      renderApp()
      enterEditMode()
      const [first, second] = names()
      expect(tabNamed(second!)?.getAttribute('aria-label')).toBe(second)

      lift(first!)

      expect(tabNamed(second!)?.getAttribute('aria-label')).toBe(`Drop ${first} here`)
    })
  })

  // Its tools are there in either mode, so a change of mode leaves it in the
  // air, and the next dwell on a tab puts it there.
  it('stays in the air across a change of mode', () => {
    renderApp()
    enterEditMode()
    const before = names()
    lift(before[1]!)

    click(speakToggle())

    expect($('.filter-tab.is-held')?.textContent).toBe(before[1])
    click(tabNamed(before[2]!))
    expect(names().indexOf(before[1]!)).toBe(names().indexOf(before[2]!) + 1)
  })

  it('puts it back when a tab that is not a category is chosen', () => {
    renderApp()
    enterEditMode()
    const before = names()
    lift(before[1]!)

    click(tabNamed('Library'))

    expect($('.is-held')).toBeNull()
    expect(names()).toEqual(before)
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
    expect(deleteOpen()).toContain('Take it out of Solo?')

    expect(tabNamed('Solo')).toBeUndefined()
    expect(tabNamed('Library')?.getAttribute('aria-selected')).toBe('true')
    expect(cells().length).toBeGreaterThan(1)
  })
})

// **Every category on screen at once.** The bar scrolled, with six arrows to
// move it — a nudge, a page and an end each way — and a category off the end
// of it was one nobody could see was there. It wraps onto another row now.
describe('the category bar', () => {
  it('has no arrows, and nothing to scroll', () => {
    renderApp()
    expect($$('.filter-arrow')).toEqual([])
    expect(catLabels()).toEqual(['Drinks', 'Evening', 'Food', 'Greetings'])
    expect(stylesheet()).toMatch(/\.filter-tabs \{[^}]*flex-wrap: wrap;/)
    expect(stylesheet()).not.toMatch(/\.filter-tabs \{[^}]*overflow/)
  })
})

// **A tab's name cut to seven characters unless it is the tab showing**, and
// only as drawn: the whole of it is still the tab's text and its name.
describe('a tab’s name', () => {
  const short = (name: string) => tabNamed(name)?.querySelector('.tab-label')?.getAttribute('data-short')

  it('is cut to seven characters on a tab that is not showing', () => {
    renderApp()
    expect(short('Translations')).toBe('Transla…')
    expect(short('Greetings')).toBe('Greetin…')
    expect(short('Evening'), 'seven is not cut').toBeNull()
    expect(tabNamed('Translations')?.getAttribute('aria-label')).toBe('Translations')
  })

  it('is whole on the tab showing', () => {
    renderApp()
    click(tabNamed('Greetings'))
    expect(short('Greetings')).toBeNull()
    expect(short('Translations')).toBe('Transla…')
  })

  it('is drawn cut and read whole', () => {
    const css = stylesheet()
    expect(css).toMatch(/\.tab-label\[data-short\] \{ font-size: 0; \}/)
    expect(css).toMatch(/\.tab-label\[data-short\]::after \{[^}]*content: attr\(data-short\);/)
  })
})

// **One row, and then Customize** — More, drawn as a glyph. jsdom lays
// nothing out, so the widths the bar measures are supplied: every tab 100 wide
// in a bar with room for three, and twelve tabs — Translations, Library and ten
// categories — is four rows of them.
describe('More', () => {
  const TEN = Array.from({ length: 10 }, (_, i) => `Cat ${String(i + 1).padStart(2, '0')}`)
  const more = () => $('.filter-tabs > .filter-more')
  /** A tile's name, which chooses it — the tile itself holds the eye and the pad too. */
  const tile = (name: string) =>
    inDoc('.more-tile')
      .find(t => t.textContent?.startsWith(name))
      ?.querySelector('.more-tile-name')
  const showing = () => tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent
  let restore: () => void
  beforeEach(() => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        custom: TEN.map((category, i) => ({ id: `custom-ten-${i}`, text: `In ${category}`, category })),
      }),
    )
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
    const room = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return (this as Element).closest('.filter-tabs-measure') ? 100 : 0
      },
    })
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as Element).classList.contains('filter-tabs') ? 320 : 0
      },
    })
    restore = () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
      Object.defineProperty(Element.prototype, 'clientWidth', room)
    }
  })
  afterEach(() => restore())

  // The tab showing is drawn as itself, with its tools, and Customize says
  // nothing but its glyph; the plus follows.
  it('holds the tabs to one row, the rest behind Customize, and room for adding one', () => {
    renderApp()
    expect(more()?.getAttribute('aria-label')).toMatch(/^Customize tabs/)
    expect(more()?.textContent, 'a word where the glyph is').toBe('')
    expect(more()?.querySelector('svg')).not.toBeNull()
    expect(showing()).toBe('Library')
    expect(more()?.nextElementSibling?.getAttribute('aria-label')).toBe('Add category')
  })

  it('goes to a category it hides, on Done, and draws it as itself with its tools', () => {
    renderApp()
    click(more())
    click(tile('Cat 09'))
    expect(showing(), 'went on the tile, before Done').toBe('Library')
    click(pickerBtn('Done'))
    act(() => void vi.advanceTimersByTime(1100))
    expect(cells().map(c => c.textContent)).toEqual(['In Cat 09'])
    expect(showing()).toBe('Cat 09')
    expect(tabNamed('Cat 09')?.querySelector('.tab-name')).not.toBeNull()
  })

  // Which tabs are behind it for room is said on their tiles, so nobody has
  // to work out what the bar left off; the one to go to is marked by its
  // colour alone, with no tick on top.
  it('says on each tile the row has no room for that it has none, and ticks nothing', () => {
    renderApp()
    click(more())
    const detail = (name: string) =>
      inDoc('.more-tile')
        .find(t => t.querySelector('.picker-tile-name')?.textContent === name)
        ?.querySelector('.picker-tile-detail')?.textContent
    expect(detail('Cat 09')).toBe('No room')
    expect(detail('Library'), 'the tab showing is on the bar').toBeUndefined()
    expect(inDoc('.more-tile .picker-tile-check')).toHaveLength(0)
    expect(inDoc('.more-tile.is-selected .picker-tile-name').map(n => n.textContent)).toEqual(['Library'])
  })

  /** A tile's second line, if it has one. */
  const detailOf = (name: string) =>
    inDoc('.more-tile')
      .find(t => t.querySelector('.picker-tile-name')?.textContent === name)
      ?.querySelector('.picker-tile-detail')?.textContent
  const roomFor = (width: number) =>
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as Element).classList.contains('filter-tabs') ? width : 0
      },
    })

  // With room for Translations, Library and two categories, Cat 03 is the
  // first with none; hidden in the grid, Cat 01 gives up its place, and Cat 03
  // has room — said before Done, as it would be after it.
  it('says again who has room as tabs are hidden and shown in the grid', () => {
    roomFor(640)
    renderApp()
    click(more())
    expect(detailOf('Cat 02')).toBeUndefined()
    expect(detailOf('Cat 03')).toBe('No room')

    click(
      inDoc('.more-tile')
        .find(t => t.textContent?.startsWith('Cat 01'))!
        .querySelector('.hide-tool'),
    )
    expect(detailOf('Cat 01')).toBe('Hidden')
    expect(detailOf('Cat 03'), 'Cat 01 hidden, and Cat 03 still short of room').toBeUndefined()
    expect(detailOf('Cat 04')).toBe('No room')

    click(
      inDoc('.more-tile')
        .find(t => t.textContent?.startsWith('Cat 01'))!
        .querySelector('.hide-tool'),
    )
    expect(detailOf('Cat 03')).toBe('No room')
  })

  // The screen turned or the window pulled narrower while the grid is open.
  it('says again who has room when the screen changes size', () => {
    const watching: ((entries: unknown[]) => void)[] = []
    const stub = globalThis.ResizeObserver
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(changed: (entries: unknown[]) => void) {
          watching.push(changed)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    try {
      roomFor(640)
      renderApp()
      click(more())
      expect(detailOf('Cat 02')).toBeUndefined()

      roomFor(420)
      act(() => watching.forEach(changed => changed([])))
      settle()
      expect(detailOf('Cat 02'), 'narrower, and Cat 02 still has room').toBe('No room')
    } finally {
      vi.stubGlobal('ResizeObserver', stub)
    }
  })

  // A bar that has left tabs off for room says so in the brand's gold — the
  // colour the tiles say No room in — before
  // anybody goes looking; one with room for all, though something is hidden,
  // does not.
  it("lights Customize in the brand's gold while tabs have no room on the row", () => {
    renderApp()
    expect(more()?.classList.contains('is-cramped')).toBe(true)
    expect(more()?.getAttribute('aria-label')).toBe('Customize tabs. Some have no room on the bar')
    const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/\.filter-tab\.filter-more\.is-cramped \{[^}]*color: *var\(--brand\)/)
  })

  it('goes nowhere on Cancel', () => {
    renderApp()
    click(more())
    click(tile('Cat 09'))
    click(pickerBtn('Cancel'))
    expect(showing()).toBe('Library')
  })

  // A tab behind More is one nobody could drop another on. A bar wide enough
  // for five tabs, which the drag pad waits for.
  it('shows every tab while one is in the air', () => {
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as Element).classList.contains('filter-tabs') ? 640 : 0
      },
    })
    renderApp()
    enterEditMode()
    click(tabNamed('Translations'))
    click(more())
    click(tile('Cat 01'))
    click(pickerBtn('Done'))
    act(() => void vi.advanceTimersByTime(1100))
    click($('.reorder-tool'))
    expect(tabLabels()).toEqual(['Translations', 'Library', ...TEN])
    expect(more()).toBeNull()
  })
})

/**
 * **Every tab can be taken off the bar**, by the eye on the tab showing —
 * Library and Translations too — and put back from Customize, which is there
 * whenever anything is off it. In Customize, nothing changes until Done.
 */
describe('hiding a tab', () => {
  const more = () => $('.filter-tabs > .filter-more')
  const showing = () => tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent
  const hideShowing = () => click($('.filter-tabs > .filter-tab .hide-tool'))
  const moreTile = (name: string) =>
    inDoc('.more-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === name)!
  /** What is kept, under whoever is signed in. */
  const stored = (): string[] => {
    const key = Object.keys(localStorage).find(k => k.startsWith('peri_hidden_tabs'))
    return key ? JSON.parse(localStorage.getItem(key)!) : []
  }

  it('takes the tab showing off the bar, goes on to the next, and offers Customize', () => {
    renderApp()
    const [first, second] = catLabels()
    click(tabNamed(first!))
    expect(more(), 'Customize with nothing off the bar and room for all').toBeNull()

    hideShowing()

    expect(tabLabels()).not.toContain(first)
    expect(showing()).toBe(second)
    expect(more()?.getAttribute('aria-label')).toBe('Customize tabs')
    expect(stored()).toEqual([first])
  })

  it('takes Library off too, and Customize puts it back on Done', () => {
    renderApp()
    expect(showing()).toBe('Library')
    hideShowing()
    expect(tabLabels()).not.toContain('Library')

    click(more())
    expect(moreTile('Library').classList.contains('is-off-bar')).toBe(true)
    click(moreTile('Library').querySelector('.hide-tool'))
    expect(tabLabels(), 'before Done').not.toContain('Library')
    click(pickerBtn('Done'))

    expect(tabLabels()).toContain('Library')
    expect(stored()).toEqual([])
    expect(more(), 'nothing off the bar now').toBeNull()
  })

  it('takes one off from Customize, and changes nothing on Cancel', () => {
    renderApp()
    const [first, second] = catLabels()
    click(tabNamed(first!))
    hideShowing()

    click(more())
    click(moreTile(second!).querySelector('.hide-tool'))
    click(pickerBtn('Cancel'))
    expect(tabLabels()).toContain(second)
    // Deaf for a second as it closes, as every grid is.
    act(() => void vi.advanceTimersByTime(1100))

    click(more())
    click(moreTile(second!).querySelector('.hide-tool'))
    click(pickerBtn('Done'))
    expect(tabLabels()).not.toContain(second)
    expect(stored().sort()).toEqual([first, second].sort())
  })

  it('keeps it off the bar across a reload', () => {
    renderApp()
    const [first] = catLabels()
    click(tabNamed(first!))
    hideShowing()

    renderApp()
    expect(tabLabels()).not.toContain(first)
    expect(more()).not.toBeNull()
  })

  // Lifted by its pad and dropped on another's name, in what Done will write.
  it('moves a category in Customize, on Done', () => {
    renderApp()
    const [first, second, third] = catLabels()
    click(tabNamed(first!))
    hideShowing()

    click(more())
    click(moreTile(second!).querySelector('.reorder-tool'))
    expect(moreTile(third!).classList.contains('is-drop-zone')).toBe(true)
    expect(moreTile('Library').classList.contains('is-drop-zone'), 'Library moves').toBe(false)
    const before = catLabels()
    click(moreTile(third!).querySelector('.more-tile-name'))
    expect(catLabels(), 'before Done').toEqual(before)
    click(pickerBtn('Done'))

    expect(catLabels().indexOf(second!)).toBe(catLabels().indexOf(third!) + 1)
  })
})

/**
 * **A narrow screen keeps the tab showing to its name**: no eye and no drag
 * pad, which a phone's one row has no room to spend on — and Customize always
 * on the row, where both are done instead.
 */
describe('on a narrow screen', () => {
  const NARROW = '(max-width: 700px)'
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query === NARROW,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })
  const more = () => $('.filter-tabs > .filter-more')
  const barTools = () => $$('.filter-tabs > .filter-tab .tab-tool')

  it('puts no eye or drag pad on the tab showing, and keeps its name to rename it', () => {
    renderApp()
    const [first] = catLabels()
    click(tabNamed(first!))
    expect(barTools()).toHaveLength(0)
    expect(tabNamed(first!)?.querySelector('.tab-name')).not.toBeNull()
    expect(tabNamed(first!)?.classList.contains('has-tools')).toBe(false)

    renameTab(first!)
    expect(
      barTools().map(t => t.getAttribute('aria-label')),
      'the bin, while renaming',
    ).toEqual([`Delete ${first}`])
  })

  it('keeps Customize on the row, with nothing hidden and room for all', () => {
    renderApp()
    expect(more()?.getAttribute('aria-label')).toBe('Customize tabs')
    expect(more()?.classList.contains('is-cramped')).toBe(false)
  })
})

/**
 * **A category deleted comes back with Undo** — its phrases, its place among
 * the tabs, on screen — and goes again with Redo. See
 * docs/decisions/undo-and-redo.md; the phrases' own undo is in
 * `app/editing.test.tsx`.
 */
describe('undoing a deleted category', () => {
  const labelled = (start: string) =>
    $$<HTMLButtonElement>('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').startsWith(start))
  const showing = () => tabs().find(t => t.getAttribute('aria-selected') === 'true')?.textContent
  const deleteCategory = (name: string) => {
    askToDelete(name)
    fireEvent.pointerMove(document.body, { clientX: 700, clientY: 500 })
    click(action('Delete'))
  }
  const hidden = (): string[] => JSON.parse(localStorage.getItem('peri_hidden_tabs') ?? '[]')

  it('brings it back with its phrases, in its place and on screen, and Redo takes it again', () => {
    renderApp()
    const order = catLabels()
    click(tabNamed('Drinks'))
    const inIt = cells().map(c => c.textContent)
    deleteCategory('Drinks')
    expect(catLabels()).not.toContain('Drinks')
    expect(labelled('Undo:')?.getAttribute('aria-label')).toBe('Undo: Deleted Drinks')

    click(labelled('Undo:'))

    expect(catLabels()).toEqual(order)
    expect(showing()).toBe('Drinks')
    expect(cells().map(c => c.textContent)).toEqual(inIt)

    click(labelled('Redo:'))

    expect(catLabels()).not.toContain('Drinks')
    expect(showing()).toBe('Library')
  })

  it('hides it again where it was hidden', () => {
    localStorage.setItem('peri_hidden_tabs', JSON.stringify(['Drinks']))
    renderApp()
    click($('.filter-tabs > .filter-more'))
    click(inDoc('.more-tile .picker-tile-name').find(n => n.textContent === 'Drinks'))
    click(pickerBtn('Done'))
    act(() => void vi.advanceTimersByTime(1100))
    deleteCategory('Drinks')
    expect(hidden()).toEqual([])

    click(labelled('Undo:'))
    expect(hidden()).toEqual(['Drinks'])

    click(labelled('Redo:'))
    expect(hidden()).toEqual([])
  })
})
