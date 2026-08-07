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
const tabs = () => $$('.filter-tab').filter(t => !t.classList.contains('add-category-tab'))
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
