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
    const rail = $$('.grid-scrollbar > .scroll-btn').map(b => b.getAttribute('aria-label'))
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
    click(tab('All'))
    showSorted()

    expect(onBoard()).toEqual(['Banana', 'Apple', 'Cherry'])
  })

  it('puts what is used most at the front', () => {
    renderApp()
    showSorted()
    chooseOrder('Most used')

    click(cellFor('Banana'))
    click(cellFor('Apple'))
    click(cellFor('Apple'))
    click(tab('All'))
    showSorted()

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
 * **The board must not move while it is being used.** The pointer is somebody's
 * gaze and it rests where it last fired, so a board that reordered itself the
 * instant a phrase was spoken would slide a different phrase under that gaze and
 * say that one too — and take the view back to the top mid-conversation.
 */
describe('a usage order settles rather than following every dwell', () => {
  it('leaves the board where it is while phrases are being used', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Banana'))
    click(cellFor('Banana'))

    expect(onBoard()).toEqual(['Cherry', 'Apple', 'Banana'])
  })

  it('counts them all the same, and shows it at the next tab', () => {
    renderApp()
    showSorted()
    chooseOrder('Recently used')

    click(cellFor('Banana'))
    click(tab('All'))
    showSorted()

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
  })

  // Changing the order is the other moment it is safe to rearrange, and the one
  // somebody has just asked for.
  it('rearranges when the order itself is changed', () => {
    renderApp()
    showSorted()
    click(cellFor('Banana'))

    chooseOrder('Most used')

    expect(onBoard()).toEqual(['Banana', 'Cherry', 'Apple'])
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
