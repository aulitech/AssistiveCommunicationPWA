import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from './App'

// Arranging the emergency bar. It spans the bar, the store and the backup
// format, and the bar is the one surface somebody reaches for without reading
// it — so where each button sits is worth its own file.

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
  localStorage.removeItem('dwellspeak_settings')
  container = render(<App />).container
  settle()
  click(editToggle())
  click(editToggle())
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const storedStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

// The add and reorder controls carry `.emergency-btn` for their styling, so the
// phrases are everything that is not one of them.
const buttons = () => $$('.emergency-btn:not(.emergency-tool)')
const labels = () => buttons().map(b => b.textContent)
const named = (text: string) => buttons().find(b => b.textContent === text)
const editToggle = () => $('.edit-toggle')
const enterEditMode = () => click(editToggle())
const reorderBtn = () => $('.emergency-reorder')
const addBtn = () => $('.emergency-add')
const startReordering = () => {
  enterEditMode()
  click(reorderBtn())
}
/** Pick a phrase up by dwell, then drop it on another. */
const dwellDrag = (from: string, to: string) => {
  click(named(from))
  click(named(to))
}
/** The same move by mouse, which is a native HTML5 drag. */
const mouseDrag = (from: string, to: string) => {
  fireEvent.dragStart(named(from)!)
  settle()
  fireEvent.dragOver(named(to)!)
  fireEvent.drop(named(to)!)
  settle()
}
// In edit mode the message box holds the phrase being edited, and the rail
// beside it carries what were the dialog's buttons.
const box = () => $<HTMLTextAreaElement>('.text-display')!
const iconBtn = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
const writePhrase = (value: string) => {
  fireEvent.change(box(), { target: { value } })
  settle()
}
const editTitle = () => $('.edit-bar-title')?.textContent

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the emergency bar as it ships', () => {
  it('is in the order Peri wrote it, with nothing stored', () => {
    renderApp()
    expect(labels()[0]).toBe('Help me!')
    expect(storedStore().emergencyOrder ?? []).toEqual([])
  })

  it('offers no reorder control outside edit mode', () => {
    renderApp()
    expect(reorderBtn()).toBeNull()
    expect(addBtn()).toBeNull()
  })

  it('offers one in edit mode', () => {
    renderApp()
    enterEditMode()
    expect(reorderBtn()).not.toBeNull()
  })
})

describe('moving an emergency phrase', () => {
  it('moves one by dwelling it and then its destination', () => {
    renderApp()
    startReordering()
    const [first, , third] = labels() as string[]

    dwellDrag(first, third)

    expect(labels().indexOf(first)).toBe(labels().indexOf(third) + 1)
  })

  it('moves one by mouse drag', () => {
    renderApp()
    startReordering()
    const [first, , third] = labels() as string[]

    mouseDrag(first, third)

    expect(labels().indexOf(first)).toBe(labels().indexOf(third) + 1)
  })

  it('moves leftwards as well as rightwards', () => {
    renderApp()
    startReordering()
    const before = labels()
    const last = before[before.length - 1]!

    dwellDrag(last, before[0]!)

    expect(labels()[0]).toBe(last)
  })

  it('persists the order and restores it on reload', () => {
    renderApp()
    startReordering()
    const [first, , third] = labels() as string[]
    dwellDrag(first, third)
    const arranged = labels()

    expect(storedStore().emergencyOrder).toHaveLength(arranged.length)

    container = render(<App />).container
    settle()
    expect(labels()).toEqual(arranged)
  })

  it('puts a lifted phrase back when dwelled a second time', () => {
    renderApp()
    startReordering()
    const before = labels()

    click(named(before[1]!)) // lift
    expect(named(before[1]!)?.className).toMatch(/is-held/)
    click(named(before[1]!)) // and put down

    expect(labels()).toEqual(before)
    expect(storedStore().emergencyOrder ?? []).toEqual([])
  })

  // The order is by id, so rewording a phrase must not send it to the end of a
  // bar somebody arranged to be reached without looking.
  it('keeps a reworded phrase where it was put', () => {
    renderApp()
    startReordering()
    const before = labels()
    dwellDrag(before[0]!, before[2]!)
    const moved = labels()
    const at = moved.indexOf(before[0]!)

    click(reorderBtn()) // back to editing
    click(named(before[0]!))
    writePhrase('Reworded')
    click(iconBtn('Save phrase'))

    expect(labels().indexOf('Reworded')).toBe(at)
  })

  it('files a phrase added later at the end, without disturbing the order', () => {
    renderApp()
    startReordering()
    const arranged = labels()
    dwellDrag(arranged[0]!, arranged[2]!)
    const before = labels()

    click(reorderBtn()) // leave reorder mode to reach the add button
    click(addBtn())
    writePhrase('I need my inhaler')
    click(iconBtn('Save phrase'))

    expect(labels()).toEqual([...before, 'I need my inhaler'])
  })

  it('drops a deleted phrase out of the stored order', () => {
    renderApp()
    startReordering()
    const arranged = labels()
    dwellDrag(arranged[0]!, arranged[2]!)
    const doomed = labels()[1]!
    const ids = storedStore().emergencyOrder
    expect(ids).toHaveLength(arranged.length)

    click(reorderBtn())
    click(named(doomed))
    click(iconBtn('Delete phrase'))

    expect(storedStore().emergencyOrder).toHaveLength(ids.length - 1)
    expect(labels()).not.toContain(doomed)
  })
})

describe('what a dwell does while reordering', () => {
  it('moves rather than loads the phrase into the editor', () => {
    renderApp()
    startReordering()
    click(buttons()[0])
    expect(box().value).toBe('')
  })

  it('loads it again once reordering is switched off', () => {
    renderApp()
    startReordering()
    click(reorderBtn())
    const first = labels()[0]
    click(buttons()[0])
    // An emergency phrase is edited without a category to file it under, which
    // is what tells it apart from a phrase off the grid.
    expect(box().value).toBe(first)
    expect(editTitle()).toBe('Editing emergency phrase')
    expect($('.category-trigger')).toBeNull()
  })

  // Adding a phrase mid-reorder would drop whatever is in the air, so the add
  // control goes quiet rather than away — moving it is worse than disabling it.
  it('keeps the add control in place but inert', () => {
    renderApp()
    enterEditMode()
    const before = $$('.emergency-tool').length
    expect(addBtn()?.getAttribute('aria-disabled')).toBeNull()

    click(reorderBtn())

    expect($$('.emergency-tool')).toHaveLength(before)
    expect(addBtn()?.getAttribute('aria-disabled')).toBe('true')
    click(addBtn())
    // Still an ordinary new phrase: the add did not fire.
    expect(editTitle()).toBe('New phrase')
  })
})

// Holding a phrase must be unmistakable, and must not rest on colour alone — so
// the held button, every other button, and the live region each say it.
describe('the cue that something is held', () => {
  it('marks the held button and every other as somewhere to drop it', () => {
    renderApp()
    startReordering()
    const [first, second] = labels() as string[]

    click(named(first))

    expect(named(first)?.className).toMatch(/is-held/)
    expect(named(first)?.className).not.toMatch(/is-drop-zone/)
    expect(named(second)?.className).toMatch(/is-drop-zone/)
  })

  it('announces the lift, since styling says nothing aloud', () => {
    renderApp()
    startReordering()
    const [first] = labels() as string[]

    click(named(first))

    expect($('.toast')?.textContent).toContain(first)
    expect($('[role="status"]')).not.toBeNull()
  })

  it('clears every trace of it once dropped', () => {
    renderApp()
    startReordering()
    const [first, , third] = labels() as string[]

    dwellDrag(first, third)

    expect($('.emergency-btn.is-held')).toBeNull()
    expect($('.emergency-btn.is-drop-zone')).toBeNull()
  })

  it('says what dwelling each button would now do', () => {
    renderApp()
    startReordering()
    const [first, second] = labels() as string[]
    expect(named(first)?.getAttribute('aria-label')).toBe(`Move ${first}`)

    click(named(first))

    expect(named(first)?.getAttribute('aria-label')).toMatch(/^Holding /)
    expect(named(second)?.getAttribute('aria-label')).toBe(`Drop ${first} here`)
  })
})

describe('leaving the mode', () => {
  // Leaving with a phrase in the air used to leave it there. Coming back, the
  // next dwell would drop the forgotten one rather than lift the one under the
  // pointer.
  it('empties its hands when reordering is switched off', () => {
    renderApp()
    startReordering()
    const before = labels()

    click(named(before[1]!)) // lift
    click(reorderBtn()) // leave reorder mode holding it
    click(reorderBtn()) // and come back

    click(named(before[2]!))
    expect(labels()).toEqual(before)
    expect(named(before[2]!)?.className).toMatch(/is-held/)
  })

  it('does not stay armed after edit mode is left and re-entered', () => {
    renderApp()
    startReordering()
    click(editToggle()) // leave edit mode
    enterEditMode()

    expect(reorderBtn()?.getAttribute('aria-pressed')).toBe('false')
    expect(addBtn()?.getAttribute('aria-disabled')).toBeNull()
  })

  // The bar's whole job is speaking. Reordering is a mode inside edit mode, and
  // edit mode is the one place the bar does not speak.
  it('speaks again as soon as edit mode is left', () => {
    renderApp()
    startReordering()
    const first = labels()[0]!
    click(editToggle()) // leave edit mode

    expect(named(first)?.getAttribute('aria-label')).toBe(first)
    expect($('.emergency-btn.reorderable')).toBeNull()
  })
})

// Tidying the category tabs must not arm the bar somebody speaks with, and the
// two modes are told apart by nothing but their own state.
describe('the two reorder modes', () => {
  it('are separate', () => {
    renderApp()
    enterEditMode()
    click($('.reorder-tab')) // the categories

    expect(reorderBtn()?.getAttribute('aria-pressed')).toBe('false')
    expect($('.emergency-btn.reorderable')).toBeNull()

    const first = labels()[0]
    click(buttons()[0])
    expect(box().value).toBe(first)
  })
})
