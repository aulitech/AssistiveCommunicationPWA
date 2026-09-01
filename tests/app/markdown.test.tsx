import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { spoken } from '../setup'

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

// The board opens in auto-speak, whatever was stored, and these tests are about
// composing and editing — so each render switches out of it, which is two
// dwells on the edit toggle: auto-speak → edit → composing.
function renderApp(custom = [MARKED, LISTED, EMERGENCY], settings: Record<string, unknown> = {}) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify(settings))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom }))
  container = render(<App />).container
  settle()
  if (settings.autoSpeak !== true) {
    click($('.edit-toggle'))
    click($('.edit-toggle'))
  }
}

const box = () => $<HTMLTextAreaElement>('.text-display')!
const message = () => box().value
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
    click($('.autospeak-toggle'))
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

// A URL is the worst thing an AAC board can hold as text: long, wrapping a whole
// row, and forty seconds of punctuation read aloud. Dropping or pasting one puts
// its name on the button and keeps the address behind it.
describe('pasting and dropping a link', () => {
  const MENU = 'https://cafe.example/menu'
  const transfer = (types: Record<string, string>) => ({
    getData: (type: string) => types[type] ?? '',
    types: Object.keys(types),
  })
  const paste = (el: Element, types: Record<string, string>) => {
    fireEvent.paste(el, { clipboardData: transfer(types) })
    settle()
  }
  const drop = (el: Element, types: Record<string, string>) => {
    fireEvent.drop(el, { dataTransfer: transfer(types) })
    settle()
  }

  it('turns a pasted URL into a link named after the site', () => {
    renderApp([])
    paste(box(), { 'text/plain': MENU })
    expect(box().value).toBe('[cafe.example](https://cafe.example/menu)')
  })

  it('uses the name of a dragged link', () => {
    renderApp([])
    drop(box(), {
      'text/uri-list': MENU,
      'text/html': `<a href="${MENU}">Today's menu</a>`,
    })
    expect(box().value).toBe(`[Today's menu](${MENU})`)
  })

  it('leaves an ordinary paste to the browser', () => {
    renderApp([])
    paste(box(), { 'text/plain': 'I would like a cup of tea' })
    // Nothing was inserted by us; the browser's own paste is what fills it in,
    // and jsdom does not do that.
    expect(box().value).toBe('')
  })

  it('adds it after what is already there rather than on top of it', () => {
    renderApp([])
    fireEvent.change($('.text-display')!, { target: { value: 'Have a look at' } })
    settle()
    drop(box(), { 'text/uri-list': MENU })
    expect(box().value).toBe('Have a look at [cafe.example](https://cafe.example/menu)')
  })

  // The two routes land in different places on purpose, and the pair below is
  // what tells them apart: with the caret left at the end — which is where
  // typing leaves it — both answers look the same.

  it('drops at the end even when the caret is somewhere else', () => {
    renderApp([])
    fireEvent.change($('.text-display')!, { target: { value: 'Have a look at' } })
    settle()
    box().selectionStart = box().selectionEnd = 0

    drop(box(), { 'text/uri-list': MENU })

    // A drop comes from outside the box and carries no caret of its own.
    expect(box().value).toBe('Have a look at [cafe.example](https://cafe.example/menu)')
  })

  it('pastes at the caret, which is somewhere the user put it', () => {
    renderApp([])
    fireEvent.change($('.text-display')!, { target: { value: 'Have a look' } })
    settle()
    box().selectionStart = box().selectionEnd = 4 // just after "Have"

    paste(box(), { 'text/plain': MENU })

    expect(box().value).toBe('Have [cafe.example](https://cafe.example/menu) a look')
  })

  // The point of the label. What is said is the name, and the address stays in
  // the message for whoever it is being sent to.
  it('speaks the label and copies the address', () => {
    renderApp([])
    paste(box(), { 'text/plain': MENU })
    click(speakBtn())
    expect(spoken).toEqual(['cafe.example'])

    click(copyBtn())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[cafe.example](https://cafe.example/menu)')
  })

  it('takes one into a phrase being written too', () => {
    renderApp()
    click($('.edit-toggle'))
    click(marked())
    const field = box()
    // A paste goes to the caret. Put it where somebody who had just typed
    // would leave it — jsdom autofocuses without placing one, so the default
    // here is the very start of the field rather than the end.
    field.selectionStart = field.selectionEnd = field.value.length
    paste(field, { 'text/plain': MENU })
    expect(box().value).toBe('**Help** me up [cafe.example](https://cafe.example/menu)')
  })
})

// A phrase that is nothing but a link is a button for going somewhere. Saying
// "cafe.example" out loud is no use to anybody.
describe('choosing a phrase that is a link', () => {
  const MENU = 'https://cafe.example/menu'
  const LINK = { id: 'custom-link', text: `[the menu](${MENU})`, category: 'Marked' }
  const SENTENCE = { id: 'custom-sentence', text: `Have a look at [the menu](${MENU})`, category: 'Marked' }
  let opened: [string, string][]
  // Put back by hand rather than with `unstubAllGlobals`, which would also take
  // away the speech-synthesis stub the shared setup installs — and then every
  // unmount after this block throws.
  const realOpen = window.open
  const stubOpen = (result: Window | null) => {
    window.open = vi.fn((url?: string | URL, target?: string) => {
      opened.push([String(url), String(target)])
      return result
    }) as typeof window.open
  }

  beforeEach(() => {
    opened = []
    stubOpen({} as Window)
  })
  afterEach(() => {
    window.open = realOpen
  })

  const showMarkedAnd = (custom: { id: string; text: string; category: string }[]) => {
    renderApp(custom)
    showMarked()
  }

  it('opens it in a new tab instead of speaking it', () => {
    showMarkedAnd([LINK])
    click(cells()[0])

    expect(opened).toEqual([[MENU, '_blank']])
    expect(spoken).toEqual([])
    expect(message()).toBe('')
  })

  // The half that protects everything else. A sentence somebody built must not
  // lose its voice because there is a link somewhere in it.
  it('still speaks a sentence that merely contains one', () => {
    showMarkedAnd([SENTENCE])
    click(cells()[0])

    expect(opened).toEqual([])
    expect(message()).toBe(`Have a look at [the menu](${MENU})`)
  })

  it('opens rather than speaks in auto-speak too', () => {
    showMarkedAnd([LINK])
    click($('.autospeak-toggle'))
    click(cells()[0])

    expect(opened).toEqual([[MENU, '_blank']])
    expect(spoken).toEqual([])
  })

  // Edit mode has to keep winning, or a link is a phrase nobody can ever
  // reword — every attempt to open the editor would leave the app instead.
  it('loads the phrase into the editor in edit mode rather than opening the link', () => {
    showMarkedAnd([LINK])
    click($('.edit-toggle'))
    click(cells()[0])

    expect(opened).toEqual([])
    expect(box().value).toBe(`[the menu](${MENU})`)
  })

  // A browser only allows this off the back of a press, and a dwell is a timer
  // firing after a pointer has rested — no press anywhere in it. Being refused
  // is a real outcome for the very users this is for, so it has to be audible
  // rather than look like a choice that simply did nothing.
  it('says so when the browser refuses', () => {
    stubOpen(null)
    showMarkedAnd([LINK])
    click(cells()[0])

    expect($('.toast')?.textContent).toMatch(/allow pop-ups/i)
    expect(spoken).toEqual([])
  })
})

describe('editing a marked-up phrase', () => {
  // The editor is where markdown gets written, so it has to show the source
  // rather than the rendering — there is nowhere else to reach the markers.
  it('loads the markup, not the words', () => {
    renderApp()
    click($('.edit-toggle'))
    click(marked())
    expect(box().value).toBe('**Help** me up')
  })
})
