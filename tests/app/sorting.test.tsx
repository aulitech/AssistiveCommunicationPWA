import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { spoken } from '../setup'

// The four orders the grid can be in, driven through the real board.
//
// Every assertion here is about what is on screen and in what order, so the grid
// has to hold only the phrases this file put there — the board also carries the
// two and a half thousand phrases Peri ships. `showSorted` is what does that.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
/** The picker is portalled to the body, so it is never inside `container`. */
const inBody = <T extends Element = HTMLElement>(sel: string) => [...document.body.querySelectorAll<T>(sel)]

const settle = () => act(() => void vi.advanceTimersByTime(50))

function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  fireEvent.click(el)
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'

// Deliberately not in alphabetical order, so A–Z has something to do.
const BOARD = [
  { id: 'custom-c', text: 'Cherry', category: 'Sorted' },
  { id: 'custom-a', text: 'Apple', category: 'Sorted' },
  { id: 'custom-b', text: 'Banana', category: 'Sorted' },
]

/** Opens the board talking, so choosing a phrase counts as using it and the message box is left alone. */
function renderApp(custom = BOARD) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify({ autoSpeak: true }))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom }))
  container = render(<App />).container
  settle()
}

const cells = () => $$('.phrase-cell')
const onBoard = () => cells().map(c => c.textContent)
const cellFor = (text: string) => cells().find(c => c.textContent === text)

const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
const showSorted = () => click(tab('Sorted'))

const sortBtn = () => $('.grid-scrollbar .sort-btn')!
const tiles = () => inBody('.picker-tile')
const tileNamed = (name: string) => tiles().find(t => t.querySelector('.picker-tile-name')?.textContent === name)

/** Opens the rail's order control and chooses one. */
function chooseOrder(name: string) {
  click(sortBtn())
  click(tileNamed(name))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the control in the rail', () => {
  // The rail is found by position rather than read, so where this sits is part
  // of the feature: above the jump to the top, outside the five that scroll.
  it('sits above the jump to the top, and nothing else moved', () => {
    renderApp()
    const rail = $$('.grid-scrollbar .scroll-btn').map(b => b.getAttribute('aria-label'))
    expect(rail[0]).toMatch(/^Phrase order:/)
    expect(rail.slice(1)).toEqual([
      'Scroll to top',
      'Previous page',
      'Scroll up',
      'Scroll down',
      'Next page',
      'Scroll to bottom',
    ])
  })

  // One glyph, four meanings — so the name is the only thing that says which of
  // them is on, to a screen reader and to anybody who has not learnt the mark.
  it('names the order it is in', () => {
    renderApp()
    expect(sortBtn().getAttribute('aria-label')).toBe('Phrase order: Custom order. Choose another')

    chooseOrder('A to Z')

    expect(sortBtn().getAttribute('aria-label')).toBe('Phrase order: A to Z. Choose another')
  })

  it('offers all four orders', () => {
    renderApp()
    click(sortBtn())
    expect(tiles().map(t => t.querySelector('.picker-tile-name')?.textContent)).toEqual([
      'Custom order',
      'A to Z',
      'Recently used',
      'Most used',
    ])
  })

  // There is nothing to try out behind the scrim, so a second dwell on Done
  // would be a target for nothing.
  it('closes as soon as one is chosen', () => {
    renderApp()
    chooseOrder('A to Z')
    expect(inBody('.picker-modal')).toHaveLength(0)
  })

  it('says which one is chosen while the picker is open', () => {
    renderApp()
    chooseOrder('Most used')
    click(sortBtn())
    expect(tileNamed('Most used')?.getAttribute('aria-selected')).toBe('true')
    expect(tileNamed('Custom order')?.getAttribute('aria-selected')).toBe('false')
  })
})

describe('what each order does', () => {
  it('opens on the order the board already has', () => {
    renderApp()
    showSorted()
    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
  })

  it('puts them in alphabetical order', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('goes back to the board’s own order', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    chooseOrder('Custom order')
    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
  })

  it('applies under every tab, not only the one it was chosen under', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    click(tab('All'))
    showSorted()
    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('is still the chosen one after a reload', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')

    cleanup()
    container = render(<App />).container
    settle()
    showSorted()

    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
    expect(sortBtn().getAttribute('aria-label')).toBe('Phrase order: A to Z. Choose another')
  })

  it('puts what was used last at the front', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Apple'))
    click(cellFor('Banana'))

    expect(onBoard()).toEqual(['Banana', 'Apple', 'Cherry'])
  })

  it('puts what is used most at the front', () => {
    renderApp()
    showSorted()
    chooseOrder('Most used')

    click(cellFor('Banana'))
    click(cellFor('Apple'))
    click(cellFor('Apple'))

    // Apple twice, Banana once, and Cherry — which nobody has used — after both,
    // where the board already had it.
    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })
})

/**
 * Arranging happens before the search ranks anything, and the difference is
 * visible: a typed word still puts the best match first, and the chosen order
 * decides the rest. The other way round, "cold" would find the phrase that is
 * nothing but that word and then bury it under everything else that matched.
 */
describe('a typed word ranks over the order', () => {
  const MATCHES = [
    { id: 'custom-z', text: 'Zebra crossing', category: 'Sorted' },
    { id: 'custom-1', text: 'Are you cold', category: 'Sorted' },
    { id: 'custom-2', text: 'Cold', category: 'Sorted' },
    { id: 'custom-3', text: 'Very cold', category: 'Sorted' },
  ]

  const type = (value: string) => {
    fireEvent.change($('.text-display')!, { target: { value } })
    settle()
  }

  it('puts the best match first, and the chosen order decides the rest', () => {
    renderApp(MATCHES)
    showSorted()
    chooseOrder('A to Z')

    type('cold')

    // "Cold" is the whole-phrase match and leads however the board is arranged;
    // the two that merely contain the word follow it in A–Z order.
    expect(onBoard()).toEqual(['Cold', 'Are you cold', 'Very cold'])
  })
})

/**
 * The board follows use **on the dwell that used it**, which is what the order
 * says on the tin. What it costs is the thing this app has to be careful about,
 * and the next block is the answer to it.
 */
describe('the board follows use as it happens', () => {
  it('rearranges on the very dwell that counted', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Banana'))

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
  })

  it('leaves the board alone under an order that is not about use', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')

    click(cellFor('Cherry'))

    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })
})

/**
 * The window the grid renders starts again when the *list* changes — a new tab,
 * a new word — and not when the same phrases arrive in a new order. It used to
 * key off the array's own identity, which under an order that follows use meant
 * the grid shrank back to one screenful on every phrase spoken, and the view
 * went with it.
 *
 * jsdom lays nothing out, so a test about the window has to supply the viewport
 * the window is measured from — see `rendering only part of a long grid`.
 */
describe('the rendered window under a live order', () => {
  const MANY = Array.from({ length: 80 }, (_, i) => ({
    id: `custom-${String(i).padStart(2, '0')}`,
    text: `Phrase ${String(i).padStart(2, '0')}`,
    category: 'Sorted',
  }))

  afterEach(() => Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight'))

  const setGeometry = (el: Element, props: Record<string, number>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, configurable: true })
  }

  /** 200px of viewport at 72px rows is 3 rows; four screens of those, 5 across. */
  const layOut = (scrollTop: number) => {
    const wrapper = $('.grid-wrapper')!
    const grid = $('.phrase-grid')!
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      el => ({ gridTemplateColumns: el === grid ? '1fr 1fr 1fr 1fr 1fr' : '' }) as CSSStyleDeclaration,
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { value: 72, configurable: true })
    setGeometry(wrapper, { clientHeight: 200, scrollHeight: 1600, scrollTop })
    act(() => void fireEvent.scroll(wrapper))
    settle()
  }

  it('keeps everything it had grown to render', () => {
    renderApp(MANY)
    showSorted()
    chooseOrder('Recently used')

    layOut(0)
    expect(cells()).toHaveLength(60)

    // Reaching the end grows the window to the whole list, which is the state
    // somebody is in when they are deep in a long category.
    layOut(1400)
    expect(cells()).toHaveLength(80)
    layOut(0)

    click(cellFor('Phrase 07'))

    expect(onBoard()[0]).toBe('Phrase 07')
    expect(cells()).toHaveLength(80)
  })

  // The other half of the same rule: a genuinely different list does start again.
  it('starts again for a different tab', () => {
    renderApp(MANY)
    showSorted()
    layOut(1400)
    expect(cells()).toHaveLength(80)
    // Back to the top, or the regrowth that follows any reset would hide it.
    layOut(0)

    click(tab('All'))
    showSorted()

    expect(cells()).toHaveLength(60)
  })
})

/**
 * **The pointer is somebody's gaze, and it rests where it last fired.** So the
 * board rearranging itself on that very dwell slides a different phrase under a
 * gaze that has not moved — and the browser gives whatever lands there a
 * `pointerenter` of its own, which is an instruction nobody gave.
 *
 * Nothing may be chosen until the gaze is aimed somewhere else. A second of
 * deafness is the wrong shape for this one: too long for somebody who has
 * already looked away, and too short for a gaze that stays put.
 */
describe('the board rearranging under a resting gaze', () => {
  /** What the browser does by itself when a cell lands under a motionless pointer. */
  const arrivesUnderThePointer = (index: number) => {
    fireEvent.pointerEnter(cells()[index])
    act(() => void vi.advanceTimersByTime(1500))
  }

  const dwellOn = (text: string) => {
    fireEvent.pointerEnter(cellFor(text)!)
    act(() => void vi.advanceTimersByTime(1500))
  }

  /** The picker's own guard, which is a timed one, has to lapse first. */
  const readyOn = (order: string) => {
    renderApp()
    showSorted()
    chooseOrder(order)
    act(() => void vi.advanceTimersByTime(1000))
    spoken.length = 0
  }

  it('says nothing for the cell that arrives under a pointer that has not moved', () => {
    readyOn('Recently used')

    dwellOn('Banana')
    expect(spoken).toEqual(['Banana'])
    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])

    arrivesUnderThePointer(2)

    expect(spoken).toEqual(['Banana'])
  })

  it('answers again once the gaze is aimed somewhere else', () => {
    readyOn('Recently used')
    dwellOn('Banana')

    fireEvent.pointerMove(document.body, { clientX: 400, clientY: 400 })
    arrivesUnderThePointer(2)

    expect(spoken).toEqual(['Banana', 'Apple'])
  })

  // A gaze drifts a pixel or two while somebody holds as still as they can, and
  // that is not aiming somewhere else.
  it('is not let go of by jitter', () => {
    readyOn('Recently used')
    dwellOn('Banana')

    fireEvent.pointerMove(document.body, { clientX: 3, clientY: 4 })
    arrivesUnderThePointer(2)

    expect(spoken).toEqual(['Banana'])
  })

  // Nothing rearranged, so nothing is held back.
  it('leaves an order that is not about use alone', () => {
    readyOn('A to Z')

    dwellOn('Apple')
    fireEvent.pointerLeave(cellFor('Apple')!)
    dwellOn('Banana')

    expect(spoken).toEqual(['Apple', 'Banana'])
  })
})

describe('the change under a resting pointer', () => {
  /**
   * Choosing an order moves every cell on the board at once, and the picker
   * closes onto a pointer that has not moved. Without the guard the phrase that
   * arrives under it starts dwelling on nobody's instruction, and gets spoken.
   */
  it('goes deaf for a second after the picker closes', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    spoken.length = 0

    fireEvent.pointerEnter(cellFor('Apple')!)
    act(() => void vi.advanceTimersByTime(1500))

    expect(spoken).toEqual([])
  })

  it('answers again once the second is up', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    act(() => void vi.advanceTimersByTime(1000))
    spoken.length = 0

    fireEvent.pointerEnter(cellFor('Apple')!)
    act(() => void vi.advanceTimersByTime(1500))

    expect(spoken).toEqual(['Apple'])
  })
})

describe('the Sent tab', () => {
  const showSent = () => click(tab('Sent'))

  // Sent is not a category. It is a record in the order it happened, newest
  // first, and that is the whole of what it is for.
  it('goes quiet rather than away, and says why', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    showSent()

    expect(sortBtn().getAttribute('aria-disabled')).toBe('true')
    expect(sortBtn().getAttribute('aria-label')).toMatch(/Sent messages are always newest first/)
  })

  it('opens nothing while it is quiet', () => {
    renderApp()
    showSent()
    click(sortBtn())
    expect(inBody('.picker-modal')).toHaveLength(0)
  })

  // Those ids name a message rather than a phrase on the board, so counting them
  // would fill the record with ids that can never match anything again.
  it('does not count a message chosen from it', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    showSent()
    click(cells()[0])

    const usage = JSON.parse(localStorage.getItem('peri_usage') ?? '{}')
    expect(Object.keys(usage)).toEqual(['custom-a'])
  })
})

/**
 * The user's own arrangement, built the way the category tabs and the emergency
 * bar are built: one dwell picks a phrase up, a second on another drops it
 * there. A pointer-drag needs a button held down while the pointer moves, which
 * is the one gesture a dwell user cannot make.
 */
describe('arranging the phrases by hand', () => {
  const editToggle = () => $('.edit-toggle')!
  const reorderBtn = () => $('.reorder-btn')
  const toast = () => $('.toast')?.textContent

  /** Auto-speak → edit is one dwell; arranging is a mode within edit mode. */
  const arrangeOn = () => {
    click(editToggle())
    click(reorderBtn())
  }

  const stored = () => JSON.parse(localStorage.getItem('dwellspeak_phrase_store_v2')!).phraseOrder

  it('is offered only in edit mode, where the phrases are what is being changed', () => {
    renderApp()
    showSorted()
    expect(reorderBtn()).toBeNull()

    click(editToggle())

    expect(reorderBtn()).not.toBeNull()
    expect(reorderBtn()!.getAttribute('aria-pressed')).toBe('false')
  })

  it('moves a phrase to where it is dropped', () => {
    renderApp()
    showSorted()
    arrangeOn()

    click(cellFor('Cherry'))
    click(cellFor('Banana'))

    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('keeps it there, by id, across a reload', () => {
    renderApp()
    showSorted()
    arrangeOn()
    click(cellFor('Cherry'))
    click(cellFor('Banana'))
    expect(stored()).toEqual({ Sorted: ['custom-a', 'custom-b', 'custom-c'] })

    cleanup()
    container = render(<App />).container
    settle()
    showSorted()

    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  // The styling alone says nothing aloud, and a dwell user has no drag cursor
  // to read.
  it('says what is in the air', () => {
    renderApp()
    showSorted()
    arrangeOn()

    click(cellFor('Cherry'))

    expect(toast()).toBe('Holding Cherry — dwell where it should go')
    expect(cellFor('Cherry')!.getAttribute('aria-label')).toMatch(/^Holding Cherry\./)
    expect(cellFor('Apple')!.getAttribute('aria-label')).toBe('Drop Cherry here')
  })

  // The only way out of a lift for somebody with no other button to press.
  it('puts a phrase back where it was when it is dwelled again', () => {
    renderApp()
    showSorted()
    arrangeOn()

    click(cellFor('Cherry'))
    click(cellFor('Cherry'))

    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
    expect(stored()).toBeUndefined()
  })

  /**
   * A move captures the order that was on screen and makes it the user's own,
   * exactly as a category move does — and the grid switches to Custom order,
   * since an arrangement nobody is looking at is not an arrangement.
   */
  it('captures the order that was showing, and shows the result', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    arrangeOn()

    click(cellFor('Cherry'))
    click(cellFor('Apple'))

    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Custom order\./)
  })

  it('is disarmed by leaving edit mode', () => {
    renderApp()
    showSorted()
    arrangeOn()
    expect(reorderBtn()!.getAttribute('aria-pressed')).toBe('true')

    click(editToggle()) // edit → composing
    click(editToggle()) // composing → edit

    expect(reorderBtn()!.getAttribute('aria-pressed')).toBe('false')
  })

  // Neither is a category, and an arrangement here belongs to one.
  it('goes quiet under All, and says why', () => {
    renderApp()
    click(editToggle())

    expect(reorderBtn()!.getAttribute('aria-disabled')).toBe('true')
    expect(reorderBtn()!.getAttribute('aria-label')).toMatch(/All cannot be arranged/)
  })

  it('goes quiet under Sent', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    click(editToggle())
    click(tab('Sent'))

    expect(reorderBtn()!.getAttribute('aria-disabled')).toBe('true')
  })

  it('opens nothing while it is quiet', () => {
    renderApp()
    click(editToggle())
    click(reorderBtn())

    expect($('.phrase-cell.reorderable')).toBeNull()
  })
})

describe('what is counted', () => {
  it('counts a phrase every time it is used', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    click(cellFor('Apple'))

    expect(JSON.parse(localStorage.getItem('peri_usage')!)['custom-a'].count).toBe(2)
  })

  it('counts nothing in edit mode, where a cell is opened rather than used', () => {
    renderApp()
    showSorted()
    click($('.edit-toggle'))
    click(cellFor('Apple'))

    expect(localStorage.getItem('peri_usage')).toBeNull()
  })

  /** A record that only ever grew would outlive the board it is about. */
  it('forgets a phrase that is deleted', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    click($('.edit-toggle'))
    click(cellFor('Apple'))
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Delete phrase'))

    expect(JSON.parse(localStorage.getItem('peri_usage')!)['custom-a']).toBeUndefined()
  })
})
