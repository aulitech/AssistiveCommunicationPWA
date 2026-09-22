import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { spoken, unmeasuredGrid } from '../setup'

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

/**
 * A pointer that travelled to what it is clicking, which is what a real one
 * does — and what a tap now has to be, since the guards answer a click exactly
 * as they answer a dwell. Somewhere new each time, because the guard that holds
 * until the pointer is aimed elsewhere measures from where the screen moved.
 */
let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
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

/**
 * For the tests about the board moving under a gaze. They share a word, so
 * choosing one narrows the grid to all three rather than to itself — which is
 * the board moving under somebody who has not moved.
 */
const SHARE_A_WORD = [
  { id: 'custom-j1', text: 'Apple juice', category: 'Sorted' },
  { id: 'custom-j2', text: 'Orange juice', category: 'Sorted' },
  { id: 'custom-j3', text: 'More juice', category: 'Sorted' },
]

/** For the tests about one tab's order not being another's. */
const TWO_CATEGORIES = [
  ...BOARD,
  { id: 'custom-x', text: 'Xylophone', category: 'Other' },
  { id: 'custom-y', text: 'Aardvark', category: 'Other' },
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

/**
 * Looks at another tab and back, which is when an order that goes by use is
 * taken again — see *Ordering the grid*. The board holds still while somebody
 * is reading it.
 */
const lookAway = () => {
  click(tab('All'))
  showSorted()
}

const sortBtn = () => $('.grid-scrollbar .sort-btn')!
const tiles = () => inBody('.picker-tile')
const tileNamed = (name: string) => tiles().find(t => t.querySelector('.picker-tile-name')?.textContent === name)

/**
 * Opens the rail's order control and chooses one, then waits out the second the
 * picker goes deaf for on its way out — every cell on the board has just moved,
 * and a person choosing what to do next takes longer than that anyway.
 */
const pickerAction = (label: string) =>
  inBody('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)

/** Opens the grid, marks one, and says Done — a tile alone changes nothing now. */
function chooseOrder(name: string) {
  click(sortBtn())
  click(tileNamed(name))
  click(pickerAction('Done'))
  act(() => void vi.advanceTimersByTime(1000))
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
    expect(sortBtn().getAttribute('aria-label')).toBe('Phrase order: Most used. Choose another')

    chooseOrder('A to Z')

    expect(sortBtn().getAttribute('aria-label')).toBe('Phrase order: A to Z. Choose another')
  })

  it('offers all four orders under a category', () => {
    renderApp()
    showSorted()
    click(sortBtn())
    expect(tiles().map(t => t.querySelector('.picker-tile-name')?.textContent)).toEqual([
      'Custom order',
      'A to Z',
      'Recently used',
      'Most used',
    ])
  })

  /**
   * A hand arrangement belongs to one category, and All shows every category at
   * once — so there is nothing there for Custom order to be an arrangement of,
   * and a tile promising one would promise something nobody could build.
   */
  it('offers every order but Custom order under All', () => {
    renderApp()
    click(sortBtn())
    expect(tiles().map(t => t.querySelector('.picker-tile-name')?.textContent)).toEqual([
      'A to Z',
      'Recently used',
      'Most used',
    ])
  })

  /**
   * All is where a single order written before there was one per tab lands, and
   * a board could have been left on Custom order under it. Hiding a tile that is
   * also a tab's way home is how you strand somebody, so a stored one reads as
   * the default rather than as a state this picker could not get back to.
   */
  it('shows the default under All for a stored order it no longer offers', () => {
    localStorage.setItem('peri_phrase_sort', JSON.stringify({ all: 'custom' }))
    renderApp()
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Most used\./)
  })

  // The same word under a real category is that category's own arrangement, and
  // is left exactly as it was chosen.
  it('keeps a stored Custom order under a category', () => {
    localStorage.setItem('peri_phrase_sort', JSON.stringify({ Sorted: 'custom' }))
    renderApp()
    showSorted()
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Custom order\./)
  })

  /**
   * **A tile marks a choice and Done makes it.** It used to close on the first
   * tile, on the grounds that there is nothing to try out behind the scrim — but
   * a rest is how somebody looks at a tile as well as how they pick one, and a
   * grid committing to the first tile the eye passes over is choosing for them.
   */
  it('waits for Done, and changes nothing before it', () => {
    renderApp()
    showSorted()
    const before = onBoard()
    click(sortBtn())
    click(tileNamed('A to Z'))

    expect(inBody('.picker-modal'), 'closed on the first tile').toHaveLength(1)
    expect(tileNamed('A to Z')!.getAttribute('aria-selected'), 'the tile does not show it is marked').toBe('true')
    expect(onBoard(), 'the board moved before anybody said Done').toEqual(before)

    click(pickerAction('Done'))
    expect(inBody('.picker-modal')).toHaveLength(0)
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: A to Z\./)
  })

  // A Cancel that did what Done did was a second button meaning nothing.
  it('changes nothing when cancelled', () => {
    renderApp()
    showSorted()
    const before = sortBtn().getAttribute('aria-label')
    click(sortBtn())
    click(tileNamed('A to Z'))
    click(pickerAction('Cancel'))

    expect(inBody('.picker-modal')).toHaveLength(0)
    expect(sortBtn().getAttribute('aria-label')).toBe(before)
  })

  // Cancelled out of and opened again, it shows what is chosen — not the tile it
  // was told to forget.
  it('opens on what is chosen, not on what was cancelled', () => {
    renderApp()
    showSorted()
    click(sortBtn())
    click(tileNamed('A to Z'))
    click(pickerAction('Cancel'))
    // Cancel lands the pointer on the board just as Done does, so it takes the
    // same second's deafness — and a press inside it is refused like a rest.
    act(() => void vi.advanceTimersByTime(1000))
    click(sortBtn())

    expect(tileNamed('A to Z')!.getAttribute('aria-selected'), 'still marked after a cancel').toBe('false')
  })

  it('says which one is chosen while the picker is open', () => {
    renderApp()
    showSorted()
    chooseOrder('Most used')
    click(sortBtn())
    expect(tileNamed('Most used')?.getAttribute('aria-selected')).toBe('true')
    expect(tileNamed('Custom order')?.getAttribute('aria-selected')).toBe('false')
  })
})

describe('what each order does', () => {
  /**
   * Most used is where every tab starts, and a phrase nobody has used keeps the
   * place the board gave it — so a board that has not been talked with yet looks
   * exactly as it always did. That is the whole of why starting there is safe.
   */
  it('opens on the order the board already has', () => {
    renderApp()
    showSorted()
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Most used\./)
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

  /**
   * The categories are not alike. A long reference list is worth having
   * alphabetically, a short one worth having by what gets used, and one somebody
   * arranged by hand worth leaving as they arranged it — so the order belongs to
   * the tab it was chosen under, and arriving at a tab brings back its own.
   */
  it('belongs to the tab it was chosen under', () => {
    renderApp(TWO_CATEGORIES)
    showSorted()
    chooseOrder('A to Z')

    click(tab('Other'))

    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Most used\./)
    expect(onBoard()).toEqual(['Xylophone', 'Aardvark'])
  })

  it('comes back to the tab it was left on', () => {
    renderApp(TWO_CATEGORIES)
    showSorted()
    chooseOrder('A to Z')
    click(tab('Other'))
    chooseOrder('Most used')
    click(cellFor('Xylophone'))

    click(tab('Sorted'))
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: A to Z\./)
    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])

    click(tab('Other'))
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Most used\./)
    expect(onBoard()).toEqual(['Xylophone', 'Aardvark'])
  })

  it('remembers each tab’s own across a reload', () => {
    renderApp(TWO_CATEGORIES)
    showSorted()
    chooseOrder('A to Z')
    click(tab('Other'))
    chooseOrder('Recently used')

    cleanup()
    container = render(<App />).container
    settle()

    click(tab('Other'))
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Recently used\./)
    click(tab('Sorted'))
    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: A to Z\./)
  })

  // All is a tab like any other here, and it is the one the board opens on.
  it('keeps All’s own order apart from a category’s', () => {
    renderApp(TWO_CATEGORIES)
    chooseOrder('A to Z')
    showSorted()

    expect(sortBtn().getAttribute('aria-label')).toMatch(/^Phrase order: Most used\./)
    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
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
    lookAway()

    expect(onBoard()).toEqual(['Banana', 'Apple', 'Cherry'])
  })

  it('puts what is used most at the front', () => {
    renderApp()
    showSorted()
    chooseOrder('Most used')

    click(cellFor('Banana'))
    click(cellFor('Apple'))
    click(cellFor('Apple'))
    lookAway()

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
 * **The board holds still while somebody is reading it.** An order that goes by
 * use used to be applied on the very dwell that chose a phrase: the cell just
 * used slid to the front and everything else moved around it, so the next thing
 * somebody looked for was not where they had left it. The counting still
 * happens then; the rearranging waits until they look somewhere else.
 */
describe('when the board takes a new order', () => {
  it('holds still on the dwell that counted', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Banana'))

    expect(onBoard(), 'the board rearranged under the phrase just chosen').toEqual(['Cherry', 'Apple', 'Banana'])
  })

  it('counts it all the same, and shows the order at the next tab', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Banana'))
    lookAway()

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
  })

  // Every dwell counts, however many of them there are before anybody looks
  // away: what the next tab shows is the record, not the last thing chosen.
  it('takes everything used while the board held still', () => {
    renderApp()
    showSorted()
    chooseOrder('Most used')

    click(cellFor('Cherry'))
    click(cellFor('Cherry'))
    click(cellFor('Apple'))
    lookAway()

    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
  })

  // Choosing the order is somebody asking for it, so it is applied there and
  // then — they are looking at the picker rather than at the board. Asked of an
  // order that reads the record, or it would answer the same either way.
  it('takes it the moment the order itself is chosen', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    click(cellFor('Banana'))

    chooseOrder('Recently used')

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
  })

  // The tab is what changed, not the order: both of these are on Most used, so
  // a board that only noticed a new order would hold the stale one for ever.
  it('takes it at a tab that is in the same order', () => {
    renderApp(TWO_CATEGORIES)
    showSorted()

    click(cellFor('Banana'))
    click(tab('Other'))
    showSorted()

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
  })

  it('leaves the board alone under an order that is not about use', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')

    click(cellFor('Cherry'))
    lookAway()

    expect(onBoard()).toEqual(['Apple', 'Banana', 'Cherry'])
  })
})

/**
 * The window the grid renders starts again when the *list* changes — a new tab,
 * a new word — and not when the same phrases arrive in a new order. It used to
 * key off the array's own identity, which meant the grid shrank back to one
 * screenful whenever the order was taken again, and the view went with it.
 *
 * jsdom lays nothing out, so a test about the window has to supply the viewport
 * the window is measured from — see `rendering only part of a long grid`.
 */
describe('the rendered window when the order changes', () => {
  const MANY = Array.from({ length: 80 }, (_, i) => ({
    id: `custom-${String(i).padStart(2, '0')}`,
    text: `Phrase ${String(i).padStart(2, '0')}`,
    category: 'Sorted',
  }))

  // This block supplies the grid's geometry itself, so the viewport the setup
  // gives every other test would be a second answer to the same question.
  beforeEach(() => unmeasuredGrid())
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

    // The same phrases in a different order, which is what choosing one does.
    chooseOrder('A to Z')

    expect(onBoard()[0]).toBe('Phrase 00')
    expect(cells(), 'the window started again for a list it already had').toHaveLength(80)
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
 * **The pointer is somebody's gaze, and it rests where it last fired.** The
 * board no longer rearranges on the dwell that chose a phrase — see *when the
 * board takes a new order* — but composing still moves it: the phrase goes into
 * the message box, the grid narrows to the word at the caret, and the browser
 * gives whatever lands under the gaze a `pointerenter` of its own, which is an
 * instruction nobody gave.
 *
 * Nothing may be chosen until the gaze is aimed somewhere else. A second of
 * deafness is the wrong shape for this one: too long for somebody who has
 * already looked away, and too short for a gaze that stays put.
 */
describe('the board moving under a resting gaze', () => {
  const message = () => $<HTMLTextAreaElement>('.text-display')!.value

  /** What the browser does by itself when a cell lands under a motionless pointer. */
  const arrivesUnderThePointer = (index: number) => {
    fireEvent.pointerEnter(cells()[index])
    act(() => void vi.advanceTimersByTime(1500))
    settle()
  }

  /**
   * A gaze arriving and staying. The settle afterwards is the caret: it lands a
   * tick after the phrase does, and the board narrows to the word under it —
   * which is the move this block is about.
   */
  const dwellOn = (text: string) => {
    fireEvent.pointerEnter(cellFor(text)!)
    act(() => void vi.advanceTimersByTime(1500))
    settle()
  }

  /**
   * Composing, where a phrase chosen goes into the box and the board narrows
   * under the pointer. Two dwells on the mode toggle: auto-speak → edit →
   * composing.
   */
  const composing = () => {
    renderApp(SHARE_A_WORD)
    showSorted()
    click($('.edit-toggle'))
    click($('.edit-toggle'))
  }

  it('takes nothing from the cell that arrives under a pointer that has not moved', () => {
    composing()
    dwellOn('Apple juice')
    expect(message()).toBe('Apple juice')
    // The board narrowed to the word at the caret, so what is under the gaze
    // now is a different phrase from the one it chose.
    expect(onBoard()).toEqual(['Apple juice', 'Orange juice', 'More juice'])

    arrivesUnderThePointer(1)

    expect(message()).toBe('Apple juice')
  })

  it('takes it once the gaze is aimed somewhere else', () => {
    composing()
    dwellOn('Apple juice')

    fireEvent.pointerMove(document.body, { clientX: 400, clientY: 400 })
    arrivesUnderThePointer(1)

    // The word at the caret is what a phrase chosen while composing replaces.
    expect(message()).toBe('Apple Orange juice')
  })

  // A gaze drifts a pixel or two while somebody holds as still as they can, and
  // that is not aiming somewhere else.
  it('is not let go of by jitter', () => {
    composing()
    // Where the gaze is resting when the board moves under it — the distance is
    // measured from here, so the test has to say where "here" is.
    fireEvent.pointerMove(document.body, { clientX: 300, clientY: 200 })
    dwellOn('Apple juice')

    fireEvent.pointerMove(document.body, { clientX: 303, clientY: 204 })
    arrivesUnderThePointer(1)

    expect(message()).toBe('Apple juice')
  })

  /**
   * What a gaze rig set to send real left clicks actually produces, and the
   * report that sent us looking for a bug that was not there: the board moves,
   * the gaze has not, and the tracker clicks again where it is resting. A click
   * is guarded exactly as a dwell is, or the platform walks straight around
   * every guard in the app.
   */
  it('takes nothing from a click that lands where the pointer already was', () => {
    composing()
    fireEvent.pointerMove(document.body, { clientX: 300, clientY: 200 })
    dwellOn('Apple juice')
    expect(message()).toBe('Apple juice')

    // No movement in between — the click is the tracker's, not a hand's.
    fireEvent.click(cells()[1])
    settle()

    expect(message()).toBe('Apple juice')
  })

  it('takes the click once the gaze has gone somewhere else', () => {
    composing()
    fireEvent.pointerMove(document.body, { clientX: 300, clientY: 200 })
    dwellOn('Apple juice')

    fireEvent.pointerMove(document.body, { clientX: 700, clientY: 500 })
    fireEvent.click(cells()[1])
    settle()

    expect(message()).toBe('Apple Orange juice')
  })

  // Nothing moved, so nothing is held back: the board is still under auto-speak
  // now that an order is taken at the tab rather than at the phrase.
  it('holds nothing back where the board did not move', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')
    spoken.length = 0

    dwellOn('Banana')
    arrivesUnderThePointer(1)

    expect(spoken).toEqual(['Banana', 'Apple'])
  })

  it('leaves an order that is not about use alone', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    spoken.length = 0

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
  it.each(['Done', 'Cancel'])('goes deaf for a second after the picker closes by %s', way => {
    renderApp()
    showSorted()
    click(sortBtn())
    click(tileNamed('A to Z'))
    click(pickerAction(way))
    spoken.length = 0

    fireEvent.pointerEnter(cellFor('Apple')!)
    act(() => void vi.advanceTimersByTime(1500))

    expect(spoken).toEqual([])
  })

  it('answers again once the second is up', () => {
    renderApp()
    showSorted()
    chooseOrder('A to Z')
    spoken.length = 0

    fireEvent.pointerEnter(cellFor('Apple')!)
    act(() => void vi.advanceTimersByTime(1500))

    expect(spoken).toEqual(['Apple'])
  })
})

/**
 * A flash on a timer was the wrong shape once the board could rearrange itself
 * on the dwell that rearranged it: a third of a second of tint on a cell that is
 * moving at the same moment. A mark that lasts says *that one, and it went
 * there*, and it ends on the next dwell rather than on a clock — what it claims
 * stops being true the moment anything else happens.
 */
describe('the mark on the last phrase said', () => {
  const marked = () => $$('.phrase-cell.selected').map(c => c.textContent)
  const railBtn = (label: string) => $$('.scroll-btn').find(b => b.getAttribute('aria-label') === label)

  it('stays on the phrase rather than fading off a timer', () => {
    renderApp()
    showSorted()

    click(cellFor('Apple'))
    act(() => void vi.advanceTimersByTime(5000))

    expect(marked()).toEqual(['Apple'])
  })

  // Says out loud what the tint says by eye.
  it('says which one it is to a screen reader', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))

    expect(cellFor('Apple')!.getAttribute('aria-current')).toBe('true')
    expect(cellFor('Banana')!.getAttribute('aria-current')).toBeNull()
  })

  it('moves to the next phrase said, and marks only one', () => {
    renderApp()
    showSorted()

    click(cellFor('Apple'))
    click(cellFor('Banana'))

    expect(marked()).toEqual(['Banana'])
  })

  it('is let go of by any other dwell', () => {
    renderApp()
    showSorted()
    click(cellFor('Apple'))
    expect(marked()).toEqual(['Apple'])

    click(railBtn('Scroll to top'))

    expect(marked()).toEqual([])
  })

  // Composing narrows the board to the word at the caret as the phrase is
  // marked, so the cell moves under the mark — which is the whole reason the
  // mark is on the cell rather than on a place in the grid.
  it('stays on the phrase when the board moves under it', () => {
    renderApp()
    showSorted()
    click($('.edit-toggle'))
    click($('.edit-toggle'))

    click(cellFor('Banana'))

    expect(onBoard(), 'the board did not move, so nothing was proved').toEqual(['Banana'])
    expect(marked()).toEqual(['Banana'])
  })

  // Nothing was said: a cell in edit mode is a phrase being opened.
  it('marks nothing in edit mode', () => {
    renderApp()
    showSorted()
    click($('.edit-toggle'))

    click(cellFor('Apple'))

    expect(marked()).toEqual([])
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
    // Three tabs are not a category now, so the label names the tab the user is
    // on rather than one of them.
    expect(reorderBtn()!.getAttribute('aria-label')).toMatch(/Open a category first/)
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

  /**
   * Switching the mode off puts down whatever was in the air. Without it the
   * phrase stays held across the round trip, and the next dwell drops the
   * forgotten one instead of lifting the cell under the pointer.
   */
  it('puts down what was in the air when the mode is switched off', () => {
    renderApp()
    showSorted()
    arrangeOn()
    click(cellFor('Cherry'))

    click(reorderBtn()) // off, which drops what was held
    click(reorderBtn()) // and on again
    click(cellFor('Apple'))

    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
    expect(toast()).toBe('Holding Apple — dwell where it should go')
  })

  // A store that only ever accumulates is one nobody can read later, and an
  // arrangement naming phrases that no longer exist is the way it would.
  it('forgets a phrase that is deleted', () => {
    renderApp()
    showSorted()
    arrangeOn()
    click(cellFor('Cherry'))
    click(cellFor('Banana'))
    expect(stored()).toEqual({ Sorted: ['custom-a', 'custom-b', 'custom-c'] })

    click(reorderBtn()) // back to plain edit mode, where a cell opens
    click(cellFor('Apple'))
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Delete phrase'))

    expect(stored()).toEqual({ Sorted: ['custom-b', 'custom-c'] })
  })

  // The last one out takes the key with it.
  it('keeps no empty arrangement behind', () => {
    renderApp([{ id: 'custom-only', text: 'Alone', category: 'Sorted' }, ...BOARD])
    showSorted()
    arrangeOn()
    click(cellFor('Alone'))
    click(cellFor('Cherry'))
    click(reorderBtn())

    for (const text of ['Alone', 'Cherry', 'Apple', 'Banana']) {
      click(cellFor(text))
      click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Delete phrase'))
    }

    expect(stored()).toEqual({})
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
