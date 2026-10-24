import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { spoken } from '../setup'

// Arranging the emergency bar. It spans the bar, the store and the backup
// format, and the bar is the one surface somebody reaches for without reading
// it — so where each button sits is worth its own file.

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
  localStorage.removeItem('dwellspeak_settings')
  container = render(<App />).container
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const storedStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

// The plus after them is not one: the phrases are every `.emergency-btn`.
const buttons = () => $$('.emergency-btn')
const labels = () => buttons().map(b => b.textContent)
const named = (text: string) => buttons().find(b => b.textContent === text)
const speakToggle = () => $('.autospeak-toggle')
const enterEditMode = () => click(speakToggle())
/** The drag pad on the emergency phrase open in the box — there is no reorder mode. */
const pad = () => $('.emergency-btn .reorder-tool')
const bin = () => $('.emergency-btn .delete-tool')
const addBtn = () => $('.emergency-add')
/** A new emergency phrase, by the plus and the dialog it opens. */
const addEmergency = (words: string) => {
  click(addBtn())
  fireEvent.change(document.body.querySelector('input[aria-label="Emergency phrase"]')!, {
    target: { value: words },
  })
  settle()
  click(
    [...document.body.querySelectorAll<HTMLElement>('.edit-modal .edit-action-btn')].find(b =>
      b.textContent?.includes('Save'),
    ),
  )
}
/** Empty the box, so the next phrase chosen opens rather than going in beside it. */
const startNew = () => click(iconBtn('Start a new phrase'))
/** Open a phrase in the box, which is what puts the pad on it, and lift it. */
const lift = (text: string) => {
  click(named(text))
  click(pad())
}
/** Pick a phrase up by its pad, then drop it on another. */
const dwellDrag = (from: string, to: string) => {
  lift(from)
  click(named(to))
}
/** The same move by mouse: the pad dragged onto another. */
const mouseDrag = (from: string, to: string) => {
  click(named(from))
  fireEvent.dragStart(pad()!)
  settle()
  fireEvent.dragOver(named(to)!)
  fireEvent.drop(named(to)!)
  settle()
}
// In edit mode the message box holds the phrase being edited.
const box = () => $<HTMLTextAreaElement>('.text-display')!
const iconBtn = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)
const writePhrase = (value: string) => {
  fireEvent.change(box(), { target: { value } })
  settle()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the emergency bar as it ships', () => {
  it('is in the order Peri wrote it, with nothing stored', () => {
    renderApp()
    expect(labels()[0]).toBe('Help me!')
    expect(storedStore().emergencyOrder ?? []).toEqual([])
  })

  // Please reaches the bar too, as long as the word is in hand — in English it
  // always is.
  it('says please on the end while it is on', () => {
    renderApp()
    click($('.please-toggle'))
    act(() => void vi.advanceTimersByTime(1000))
    click(buttons()[0])
    expect(spoken.at(-1)).toBe('Help me, please!')
  })

  // Nothing to arrange; but adding one is there in every mode, as adding a
  // category is.
  it('offers nothing to arrange outside edit mode, and the plus', () => {
    renderApp()
    expect($('.emergency-btn .tab-tool')).toBeNull()
    expect(addBtn()).not.toBeNull()
  })

  // As the tab showing carries its own: the phrase open in the box, and only it.
  it('puts a drag pad on the phrase open in the box, and on no other', () => {
    renderApp()
    enterEditMode()
    expect(pad()).toBeNull()
    expect(addBtn()).not.toBeNull()

    const [first, second] = labels() as string[]
    click(named(first))
    expect(named(first)?.querySelector('.reorder-tool')).not.toBeNull()
    expect(named(second)?.querySelector('.tab-tool')).toBeNull()

    startNew()
    click(named(second))
    expect(named(first)?.querySelector('.tab-tool')).toBeNull()
    expect(named(second)?.querySelector('.reorder-tool')).not.toBeNull()
  })

  // The bar's own reorder mode is gone, and so is its toggle.
  it('has no reorder toggle of its own', () => {
    renderApp()
    enterEditMode()
    expect($('.emergency-reorder')).toBeNull()
    expect($$('.emergency-bar > :not(.emergency-btn)').map(el => el.className)).toEqual(['emergency-add'])
  })
})

describe('moving an emergency phrase', () => {
  it('moves one by its drag pad and then its destination', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = labels() as string[]

    dwellDrag(first, third)

    expect(labels().indexOf(first)).toBe(labels().indexOf(third) + 1)
  })

  it('moves one by mouse, dragging the pad', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = labels() as string[]

    mouseDrag(first, third)

    expect(labels().indexOf(first)).toBe(labels().indexOf(third) + 1)
  })

  it('moves leftwards as well as rightwards', () => {
    renderApp()
    enterEditMode()
    const before = labels()
    const last = before[before.length - 1]!

    dwellDrag(last, before[0]!)

    expect(labels()[0]).toBe(last)
  })

  it('persists the order and restores it on reload', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = labels() as string[]
    dwellDrag(first, third)
    const arranged = labels()

    expect(storedStore().emergencyOrder).toHaveLength(arranged.length)

    container = render(<App />).container
    settle()
    expect(labels()).toEqual(arranged)
  })

  it('puts a lifted phrase back when its pad is dwelled a second time', () => {
    renderApp()
    enterEditMode()
    const before = labels()

    lift(before[1]!)
    expect(named(before[1]!)?.className).toMatch(/is-held/)
    expect(pad()?.getAttribute('aria-pressed')).toBe('true')
    click(pad()) // and put down

    expect(labels()).toEqual(before)
    expect($('.emergency-btn.is-held')).toBeNull()
    expect(storedStore().emergencyOrder ?? []).toEqual([])
  })

  // The order is by id, so rewording a phrase must not send it to the end of a
  // bar somebody arranged to be reached without looking.
  it('keeps a reworded phrase where it was put', () => {
    renderApp()
    enterEditMode()
    const before = labels()
    dwellDrag(before[0]!, before[2]!)
    const at = labels().indexOf(before[0]!)

    // Still the one open in the box.
    expect(box().value).toBe(before[0])
    writePhrase('Reworded')
    click(iconBtn('Save phrase'))

    expect(labels().indexOf('Reworded')).toBe(at)
  })

  it('files a phrase added later at the end, without disturbing the order', () => {
    renderApp()
    enterEditMode()
    const arranged = labels()
    dwellDrag(arranged[0]!, arranged[2]!)
    const before = labels()

    addEmergency('I need my inhaler')

    expect(labels()).toEqual([...before, 'I need my inhaler'])
  })

  it('drops a deleted phrase out of the stored order', () => {
    renderApp()
    enterEditMode()
    const arranged = labels()
    dwellDrag(arranged[0]!, arranged[2]!)
    const doomed = labels()[1]!
    const ids = storedStore().emergencyOrder
    expect(ids).toHaveLength(arranged.length)

    startNew()
    click(named(doomed))
    click(bin())
    click(
      [...document.body.querySelectorAll<HTMLElement>('.edit-action-btn')].find(b => b.textContent === 'Delete'),
    )

    expect(storedStore().emergencyOrder).toHaveLength(ids.length - 1)
    expect(labels()).not.toContain(doomed)
  })
})

// The phrase open in the box carries its bin from the moment it is opened.
describe('deleting an emergency phrase', () => {
  it('puts the bin against its left edge and the pad against its right', () => {
    renderApp()
    enterEditMode()
    const first = labels()[0]!
    click(named(first))

    const tools = [...named(first)!.querySelectorAll('.cell-tools > .tab-tool')]
    expect(tools.map(t => t.getAttribute('aria-label'))).toEqual([
      'Delete this emergency phrase',
      'Move this emergency phrase',
    ])
  })

  it('asks first, and keeping it keeps it', () => {
    renderApp()
    enterEditMode()
    const first = labels()[0]!
    click(named(first))
    click(bin())
    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')
    expect(dialog?.textContent).toContain('Delete this emergency phrase?')
    click(
      [...document.body.querySelectorAll<HTMLElement>('.edit-action-btn')].find(b => b.textContent === 'Keep it'),
    )

    expect(document.body.querySelector<HTMLElement>('[role="alertdialog"]')).toBeNull()
    expect(labels()).toContain(first)
  })

  it('takes it off the bar when it is confirmed, and Undo puts it back', () => {
    renderApp()
    enterEditMode()
    const first = labels()[0]!
    click(named(first))
    click(bin())
    click(
      [...document.body.querySelectorAll<HTMLElement>('.edit-action-btn')].find(b => b.textContent === 'Delete'),
    )
    expect(labels()).not.toContain(first)

    click($$('.icon-btn').find(b => /^Undo/.test(b.getAttribute('aria-label') ?? '')))
    expect(labels()).toContain(first)
  })
})

describe('what a dwell does while one is lifted', () => {
  it('drops it rather than opening the phrase dwelled', () => {
    renderApp()
    enterEditMode()
    const [first, second] = labels() as string[]
    lift(first)
    click(named(second))
    expect(box().value).toBe(first)
  })

  it('opens a phrase again once it is put down', () => {
    renderApp()
    enterEditMode()
    const [first, second, third] = labels() as string[]
    dwellDrag(first, second)
    startNew()
    click(named(third))
    expect(box().value).toBe(third)
  })

  // A new phrase is another phrase in the box, so whatever was in the air is
  // put back where it was.
  it('puts it back when a new emergency phrase is started', () => {
    renderApp()
    enterEditMode()
    const before = labels()
    lift(before[0]!)

    click(addBtn())

    expect($('.emergency-btn.is-held')).toBeNull()
    expect($('.emergency-btn.is-drop-zone')).toBeNull()
    expect(labels()).toEqual(before)
  })
})

// Holding a phrase must be unmistakable, and must not rest on colour alone — so
// the held button, every other button, and the live region each say it.
describe('the cue that something is held', () => {
  it('marks the held button and every other as somewhere to drop it', () => {
    renderApp()
    enterEditMode()
    const [first, second] = labels() as string[]

    lift(first)

    expect(named(first)?.className).toMatch(/is-held/)
    expect(named(first)?.className).not.toMatch(/is-drop-zone/)
    expect(named(second)?.className).toMatch(/is-drop-zone/)
  })

  it('announces the lift, since styling says nothing aloud', () => {
    renderApp()
    enterEditMode()
    const [first] = labels() as string[]

    lift(first)

    expect($('.toast')?.textContent).toContain(first)
    expect($('[role="status"]')).not.toBeNull()
  })

  it('clears every trace of it once dropped', () => {
    renderApp()
    enterEditMode()
    const [first, , third] = labels() as string[]

    dwellDrag(first, third)

    expect($('.emergency-btn.is-held')).toBeNull()
    expect($('.emergency-btn.is-drop-zone')).toBeNull()
  })

  it('says what dwelling the pad and each button would now do', () => {
    renderApp()
    enterEditMode()
    const [first, second] = labels() as string[]
    click(named(first))
    expect(pad()?.getAttribute('aria-label')).toBe('Move this emergency phrase')

    click(pad())

    expect(pad()?.getAttribute('aria-label')).toBe('Put it back where it was')
    expect(named(second)?.getAttribute('aria-label')).toBe(`Drop ${first} here`)
  })
})

describe('leaving edit mode', () => {
  // Leaving with a phrase in the air used to leave it there. Coming back, the
  // next dwell would drop the forgotten one rather than open the one under the
  // pointer.
  it('does not stay armed after edit mode is left and re-entered', () => {
    renderApp()
    enterEditMode()
    const before = labels()
    lift(before[1]!)
    click(speakToggle()) // leave edit mode
    enterEditMode()

    expect($('.emergency-btn.is-held')).toBeNull()
    expect($('.emergency-btn.is-drop-zone')).toBeNull()
    startNew()
    click(named(before[2]!))
    expect(labels()).toEqual(before)
    expect(box().value).toBe(before[2])
  })

  // The bar's whole job is speaking, and edit mode is the one place it does not.
  it('speaks again as soon as edit mode is left', () => {
    renderApp()
    enterEditMode()
    const first = labels()[0]!
    lift(first)
    click(speakToggle()) // leave edit mode

    expect(named(first)?.getAttribute('aria-label')).toBe(first)
    expect($('.emergency-btn .tab-tool')).toBeNull()
    expect($('.emergency-btn.is-drop-zone')).toBeNull()
  })
})

// Tidying the category tabs must not arm the bar somebody speaks with.
describe('a tab and an emergency phrase in the air', () => {
  it('are separate', () => {
    localStorage.setItem(
      STORE_KEY,
      // Three of its own, and Translations and Library: five tabs, which the
      // drag pad waits for.
      JSON.stringify({
        custom: ['Kitchen', 'Garden', 'Hall'].map((category, i) => ({
          id: `custom-room-${i}`,
          text: `In the ${category}`,
          category,
        })),
      }),
    )
    renderApp()
    enterEditMode()
    // A category lifted by its own tool.
    click($$('.filter-tab[role="tab"]').find(t => t.textContent === 'Kitchen'))
    click($('.filter-tab .reorder-tool'))
    expect($('.filter-tab.is-held')).not.toBeNull()

    expect($('.emergency-btn.is-drop-zone')).toBeNull()

    const first = labels()[0]
    click(buttons()[0])
    expect(box().value).toBe(first)
  })
})

// **Words the bar cuts off are shown whole, large, in the middle of the phrase
// table** while their button is rested on — a phone held upright fits six
// buttons a word or two wide. jsdom lays nothing out, so the cut is supplied:
// every button's words wider than the button shows.
describe('a cut-off emergency phrase', () => {
  const peek = () => $('.grid-area > .emergency-peek')
  const cutOff = (cut: boolean) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return cut && (this as Element).classList.contains('emergency-btn') ? 200 : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as Element).classList.contains('emergency-btn') ? 100 : 0
      },
    })
  }
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  })

  it('is shown whole in the table while its button is rested on, and goes when it is left', () => {
    cutOff(true)
    renderApp()
    const first = buttons()[0]!
    fireEvent.pointerEnter(first)
    settle()
    expect(peek()?.textContent).toBe(first.getAttribute('aria-label'))
    expect(peek()?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.pointerLeave(first)
    settle()
    expect(peek()).toBeNull()
  })

  it('is not shown where nothing on the bar is cut off', () => {
    cutOff(false)
    renderApp()
    fireEvent.pointerEnter(buttons()[0]!)
    settle()
    expect(peek()).toBeNull()
  })
})
