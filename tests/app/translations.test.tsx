import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { forgetTranslations, seedTranslations } from '../../src/core/translation'
import { spoken, lastUtterance, voices } from '../setup'

// The Translations tab, driven through the real board.
//
// The board stays in the user's own words and the translation is what comes out,
// so until this existed a translation lasted exactly as long as it took to
// speak. This is the tab that keeps it — and the tests below are mostly about
// the two halves of "keeps it": what a cell draws, and what it says.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]

const settle = () => act(() => void vi.advanceTimersByTime(50))

/** A pointer that travelled to what it is clicking — see `sorting.test.tsx`. */
let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'

const BOARD = [
  { id: 'custom-c', text: 'Cherry', category: 'Sorted' },
  { id: 'custom-a', text: 'Apple', category: 'Sorted' },
]

/** Opens the board talking, so choosing a phrase speaks it and counts as said. */
function renderApp(settings: Record<string, unknown> = {}, custom = BOARD) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify({ autoSpeak: true, ...settings }))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom }))
  container = render(<App />).container
  settle()
}

const cells = () => $$('.phrase-cell')
const cellFor = (text: string) => cells().find(c => c.querySelector('.phrase-cell-text')?.textContent === text)

const tab = (name: string) => $$('.filter-tab[role="tab"]').find(t => t.textContent === name)
const tabLabels = () => $$('.filter-tab[role="tab"]').map(t => t.textContent)
const showSorted = () => click(tab('Sorted'))
const showTranslations = () => click(tab('Translations'))

/** What the tab holds: the words that came out, and the wording underneath. */
const onTab = () =>
  cells().map(c => [
    c.querySelector('.phrase-cell-text')?.textContent,
    c.querySelector('.phrase-cell-detail')?.textContent,
  ])

const sortBtn = () => $('.grid-scrollbar .sort-btn')!
const editToggle = () => $('.edit-toggle')!
const stored = () => JSON.parse(localStorage.getItem('peri_translated') ?? '[]') as { tag: string }[]

/** Says a seeded phrase in the language the board is set to. */
function saySpanish() {
  seedTranslations('es', { Cherry: 'Cereza', Apple: 'Manzana' })
  showSorted()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  forgetTranslations()
})

describe('where the tab sits', () => {
  /**
   * Two tabs are pinned at the front and this one at the very end. It is the tab
   * nobody reaches for mid-sentence, and the one tab whose cells are not in the
   * language the rest of the board is written in.
   */
  it('is always the last tab, whatever the categories do', () => {
    renderApp()
    expect(tabLabels().at(-1)).toBe('Translations')
    expect(tabLabels().slice(0, 2)).toEqual(['Sent', 'All'])
  })

  it('is there before anything has been translated, and says so', () => {
    renderApp()
    showTranslations()
    expect(cells()).toHaveLength(0)
    expect($('.grid-empty')?.textContent).toMatch(/Nothing translated yet/)
  })

  // A record in the order it happened, so the order is not the user's to change
  // — the same as Sent, and the control says which tab it is on.
  it('keeps an order of its own, and the control goes quiet and says why', () => {
    renderApp()
    showTranslations()
    expect(sortBtn().getAttribute('aria-disabled')).toBe('true')
    expect(sortBtn().getAttribute('aria-label')).toMatch(/Translations are always newest first/)
  })

  it('cannot be arranged by hand', () => {
    renderApp()
    showTranslations()
    click(editToggle())
    const arrange = $$('.grid-scrollbar .reorder-btn')[0]
    expect(arrange.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('what lands in it', () => {
  it('keeps a phrase said in another language, newest first', () => {
    renderApp({ language: 'es' })
    saySpanish()

    click(cellFor('Apple'))
    click(cellFor('Cherry'))
    showTranslations()

    expect(onTab()).toEqual([
      ['Cereza', 'Cherry'],
      ['Manzana', 'Apple'],
    ])
  })

  /**
   * The cell draws what came out, with the board's own wording under it. Without
   * the second line the tab is a wall of text the person using the board cannot
   * read — every other surface here is in their own language.
   */
  it('draws the translation with the wording underneath', () => {
    renderApp({ language: 'es' })
    saySpanish()
    click(cellFor('Cherry'))
    showTranslations()

    const cell = cells()[0]
    expect(cell.querySelector('.phrase-cell-text')?.textContent).toBe('Cereza')
    expect(cell.querySelector('.phrase-cell-detail')?.textContent).toBe('Cherry')
    // Every other cell in the app is a centring flex row holding one run of
    // text. Without this the two lines sit side by side instead of stacking,
    // which jsdom lays out no differently and a screen does.
    expect([...cell.classList]).toContain('has-detail')
    // The tint and the small grey say nothing aloud, so the label reads both.
    expect(cell.getAttribute('aria-label')).toBe('Cereza — Cherry')
  })

  it('keeps the language it was said in', () => {
    renderApp({ language: 'es-PR' })
    seedTranslations('es-PR', { Cherry: 'Cereza' })
    showSorted()
    click(cellFor('Cherry'))

    expect(stored().map(t => t.tag)).toEqual(['es-PR'])
  })

  it('survives a reload', () => {
    renderApp({ language: 'es' })
    saySpanish()
    click(cellFor('Cherry'))

    cleanup()
    container = render(<App />).container
    settle()
    showTranslations()

    expect(onTab()).toEqual([['Cereza', 'Cherry']])
  })

  /**
   * A phrase spoken as it was written is not a translation, and an entry saying
   * otherwise would be wrong in a list somebody reads. English board, nothing
   * translated, nothing kept.
   */
  it('keeps nothing while the board speaks its own language', () => {
    renderApp({ language: 'en-GB' })
    saySpanish()
    click(cellFor('Cherry'))

    expect(spoken).toEqual(['Cherry'])
    expect(stored()).toEqual([])
  })

  it('keeps nothing with no language set at all', () => {
    renderApp()
    saySpanish()
    click(cellFor('Cherry'))

    expect(spoken).toEqual(['Cherry'])
    expect(stored()).toEqual([])
  })

  // Patois is the case with no service behind it at all: a phrase outside the
  // shipped table is spoken as it was written, so there is no translation to
  // keep — while one inside the table is kept like any other.
  it('keeps nothing for a phrase that fell back to the original', () => {
    renderApp({ language: 'jam' })
    seedTranslations('jam', { Cherry: 'Cherry dem' })
    showSorted()

    click(cellFor('Apple'))
    expect(stored()).toEqual([])

    click(cellFor('Cherry'))
    expect(stored()).toHaveLength(1)
  })

  // Those phrases are never in the grid, and that surface exists to not wait on
  // anything. A storage write on the way to saying "Help me!" is the one thing
  // it must not pick up.
  it('keeps nothing said on the emergency bar', () => {
    renderApp({ language: 'es' })
    seedTranslations('es', { 'Help me!': 'Ayúdame!' })

    click($('.emergency-btn'))

    expect(spoken).toEqual(['Ayúdame!'])
    expect(stored()).toEqual([])
  })

  // Those ids name a translation rather than a phrase on the board, so counting
  // them would fill the usage record with ids that never match anything.
  it('counts nothing towards how much a phrase is used', () => {
    renderApp({ language: 'es' })
    saySpanish()
    click(cellFor('Cherry'))
    const before = localStorage.getItem('peri_usage')

    showTranslations()
    click(cells()[0])

    expect(localStorage.getItem('peri_usage')).toBe(before)
  })
})

describe('saying one again', () => {
  it('says the words that came out, not the ones on the board', () => {
    renderApp({ language: 'es' })
    saySpanish()
    click(cellFor('Cherry'))
    showTranslations()
    spoken.length = 0

    click(cells()[0])

    expect(spoken).toEqual(['Cereza'])
  })

  /**
   * They have been translated already. Sending them again would ask the service
   * for Spanish from Spanish, and would file the Spanish as a translation of
   * itself so the tab grew every time it was used.
   *
   * The seeded `Cereza` is the trap that makes it visible: looked up a second
   * time, the cell would come out as something else entirely.
   */
  it('does not translate them a second time', () => {
    renderApp({ language: 'es' })
    seedTranslations('es', { Cherry: 'Cereza', Cereza: 'SAID TWICE' })
    showSorted()
    click(cellFor('Cherry'))
    showTranslations()
    spoken.length = 0

    click(cells()[0])
    click(cells()[0])

    expect(spoken).toEqual(['Cereza', 'Cereza'])
    expect(onTab()).toEqual([['Cereza', 'Cherry']])
  })

  /**
   * The language comes off the cell rather than off the board. A tab full of
   * Spanish is still Spanish once the board has been set back to English, and an
   * English synthesiser reading it is what the stored tag exists to stop.
   */
  it('says them as their own language after the board has moved on', () => {
    localStorage.setItem(
      'peri_translated',
      JSON.stringify([{ id: 't1', source: 'Cherry', text: 'Cereza', tag: 'es-PR' }]),
    )
    renderApp()
    showTranslations()

    click(cells()[0])

    expect(spoken).toEqual(['Cereza'])
    expect(lastUtterance?.lang).toBe('es-PR')
  })

  it('says them as that language', () => {
    renderApp({ language: 'es-PR' })
    seedTranslations('es-PR', { Cherry: 'Cereza' })
    showSorted()
    click(cellFor('Cherry'))
    showTranslations()

    click(cells()[0])

    expect(lastUtterance?.lang).toBe('es-PR')
  })

  /**
   * A voice is a language, and a cell here was recorded while the board was set
   * to that language — so the voice chosen under it is the voice it was heard
   * in. Seeded through the store rather than the picker, which is four dwells
   * away from a grid this test is not about.
   */
  it('says them in the voice remembered for that language', () => {
    voices.push(
      {
        voiceURI: 'uri-Monica',
        name: 'Monica',
        lang: 'es-ES',
        default: false,
        localService: true,
      } as SpeechSynthesisVoice,
      {
        voiceURI: 'uri-Daniel',
        name: 'Daniel',
        lang: 'en-GB',
        default: true,
        localService: true,
      } as SpeechSynthesisVoice,
    )
    renderApp({ language: 'es', voiceURI: 'uri-Daniel', voicesByLanguage: { es: 'uri-Monica' } })
    saySpanish()
    click(cellFor('Cherry'))
    showTranslations()

    click(cells()[0])

    expect(lastUtterance?.voice?.voiceURI).toBe('uri-Monica')
  })
})

describe('in edit mode', () => {
  const action = (label: string) => $$('.icon-btn').find(b => b.getAttribute('aria-label') === label)

  function aTranslation() {
    renderApp({ language: 'es' })
    saySpanish()
    click(cellFor('Cherry'))
    showTranslations()
    click(editToggle())
  }

  // Somebody who has just said something private needs a way to take it off the
  // record, and this is the only one there is.
  it('forgets a translation rather than deleting a phrase', () => {
    aTranslation()
    click(cells()[0])

    // The label names what it is, or "Forget this" is a guess. It said
    // "message" for both until there was a second record to come off.
    expect(action('Forget this translation')).toBeDefined()
    click(action('Forget this translation'))

    expect(stored()).toEqual([])
    expect(cells()).toHaveLength(0)
  })

  /**
   * Saving keeps what is in the box as an ordinary phrase. Its language is not
   * carried over: a phrase on the board is spoken in the language the board is
   * set to, and a phrase that quietly ignored the setting would be the one
   * exception nobody could see.
   */
  it('keeps one as a phrase of the user’s own, and leaves the record alone', () => {
    aTranslation()
    click(cells()[0])

    click(action('Keep this translation as a phrase'))

    expect(stored()).toHaveLength(1)
    // On the board, under whichever category it was filed — the board goes
    // there with it. It went to the first one: Translations is not a category,
    // so entering edit mode on it chose none. This clicked Sorted once, which
    // in edit mode opened a rename and left the board where it was; a tab goes
    // to its category now, and Cereza was never filed there.
    expect(cellFor('Cereza')).toBeDefined()
  })
})
