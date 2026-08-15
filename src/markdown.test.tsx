import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from './App'
import { spoken } from './test/setup'

// Markdown in a phrase, driven through the real app.
//
// The parse itself is covered in core/markdown.test.ts. What matters here is
// where the markup ends up once a phrase is used: drawn on the board, gone from
// what is spoken and searched, and kept in the message box and on the clipboard.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  fireEvent.click(el)
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'

const MARKED = { id: 'custom-md', text: '**Help** me up', category: 'Marked' }
const LISTED = { id: 'custom-list', text: '# Drinks\n- water\n- juice', category: 'Marked' }
const EMERGENCY = { id: 'custom-md-em', text: '**Stop** now', category: 'Emergency' }

function renderApp(custom = [MARKED, LISTED, EMERGENCY]) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom }))
  container = render(<App />).container
  settle()
}

const message = () => $<HTMLTextAreaElement>('.text-display')!.value
const cells = () => $$('.phrase-cell')
const cellFor = (id: string) => cells().find(c => c.getAttribute('aria-label')?.includes(id))
const marked = () => cellFor('Help me up')!

/**
 * Narrows the grid to the seeded category. The board also holds the two and a
 * half thousand phrases Peri ships, several of which begin with "Help" — so
 * anything about what is on screen, or in what order, has to be asked of a grid
 * holding only the phrases the test put there.
 */
const showMarked = () => click($$('.filter-tab[role="tab"]').find(t => t.textContent === 'Marked'))
const typeInBox = (value: string) => {
  fireEvent.change($('.text-display')!, { target: { value } })
  settle()
}
const speakBtn = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')
const copyBtn = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Copy to clipboard')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('what the board draws', () => {
  it('shows the words and not the markers', () => {
    renderApp()
    expect(marked().textContent).toBe('Help me up')
    expect(marked().textContent).not.toContain('*')
  })

  it('marks the emphasised words up so they can be styled', () => {
    renderApp()
    const strong = marked().querySelector('.md-strong')
    expect(strong?.textContent).toBe('Help')
  })

  it('draws a heading and a bullet list as separate lines', () => {
    renderApp()
    const cell = cellFor('Drinks')!
    expect(cell.querySelectorAll('.md-line')).toHaveLength(3)
    expect(cell.querySelector('.md-heading')?.textContent).toBe('Drinks')
    expect(cell.querySelectorAll('.md-item')).toHaveLength(2)
  })

  // The bullet is drawn, not typed, so it is not part of what the phrase says.
  it('keeps the bullet out of the text', () => {
    renderApp()
    expect(cellFor('Drinks')!.textContent).toBe('Drinkswaterjuice')
  })

  // A screen reader announcing "asterisk asterisk help" is the same failure as
  // the app speaking it.
  it('labels the cell with the words alone', () => {
    renderApp()
    expect(marked().getAttribute('aria-label')).toBe('Help me up')
  })

  it('leaves a phrase with no markup in it exactly as it was', () => {
    renderApp([{ id: 'custom-plain', text: 'I would like a cup of tea', category: 'Marked' }])
    showMarked()
    expect(cells()).toHaveLength(1)
    expect(cells()[0].textContent).toBe('I would like a cup of tea')
    expect(cells()[0].querySelector('.md-line')).toBeNull()
  })
})

describe('finding a marked-up phrase', () => {
  // The explicit ask. Nobody types the asterisks they can see are not there,
  // and a whole-phrase prefix would otherwise never match a phrase opening
  // with one.
  it('is found by typing the words, not the markup', () => {
    renderApp()
    showMarked()
    typeInBox('help')
    expect(cells().map(c => c.textContent)).toContain('Help me up')
  })

  it('is found by a word further along it', () => {
    renderApp()
    showMarked()
    typeInBox('juice')
    expect(cells().map(c => c.textContent)).toContain('Drinkswaterjuice')
  })

  // The ranking puts a whole-phrase prefix above a word prefix. Scored against
  // the raw text this phrase does not merely rank badly — "**help" begins with
  // no letter of the query and shares no initials, so it scores nothing and
  // drops off the list altogether.
  it('ranks it as though the markers were not there', () => {
    renderApp([MARKED, { id: 'custom-other', text: 'I can help you', category: 'Marked' }])
    showMarked()
    typeInBox('help')
    const texts = cells().map(c => c.textContent)
    expect(texts).toContain('Help me up')
    expect(texts.indexOf('Help me up')).toBeLessThan(texts.indexOf('I can help you'))
  })
})

describe('what leaves the board', () => {
  it('speaks the words without the markup', () => {
    renderApp()
    click(marked())
    click(speakBtn())
    expect(spoken).toEqual(['Help me up'])
  })

  it('speaks a list as its lines, with no markers', () => {
    renderApp()
    click(cellFor('Drinks'))
    click(speakBtn())
    expect(spoken).toEqual(['Drinks\nwater\njuice'])
  })

  // Chosen deliberately: the message box is where a message is assembled and
  // edited, so it holds what the phrase actually is, markers and all.
  it('puts the markup into the message box', () => {
    renderApp()
    click(marked())
    expect(message()).toBe('**Help** me up')
  })

  it('copies the markup, so it can be pasted somewhere that renders it', () => {
    renderApp()
    click(marked())
    click(copyBtn())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('**Help** me up')
  })

  // Auto-speak never reaches the message box, so it is its own path to the
  // synthesiser and its own chance to say the asterisks out loud.
  it('speaks the words in auto-speak too', () => {
    renderApp()
    click($$('.toggle-btn')[0]) // auto-speak
    click(marked())
    expect(spoken).toEqual(['Help me up'])
    expect(message()).toBe('')
  })
})

describe('the emergency bar', () => {
  const emergencyFor = (text: string) =>
    $$('.emergency-btn:not(.emergency-tool)').find(b => b.textContent === text)

  it('draws the markup', () => {
    renderApp()
    expect(emergencyFor('Stop now')?.querySelector('.md-strong')?.textContent).toBe('Stop')
  })

  it('speaks the words alone', () => {
    renderApp()
    click(emergencyFor('Stop now'))
    expect(spoken).toEqual(['Stop now'])
  })

  it('labels itself with the words alone', () => {
    renderApp()
    expect(emergencyFor('Stop now')?.getAttribute('aria-label')).toBe('Stop now')
  })
})

describe('editing a marked-up phrase', () => {
  // The editor is where markdown gets written, so it has to show the source
  // rather than the rendering — there is nowhere else to reach the markers.
  it('opens on the markup, not on the words', () => {
    renderApp()
    click($$('.toggle-btn')[1]) // edit mode
    click(marked())
    expect($<HTMLTextAreaElement>('.edit-modal-text')?.value).toBe('**Help** me up')
  })
})
