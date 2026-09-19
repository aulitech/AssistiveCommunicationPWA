import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import App from '../../src/App'
import { DEFAULT_SETTINGS } from '../../src/core/store'

// **Everything a dwell has to be able to reach.**
//
// An audit, kept as tests so it stays done. Every one of these was a control or a
// surface somebody working the board by gaze alone could see and could not use:
// a field that took the caret only on a click, a list that scrolled only by
// wheel, a link that answered only to a press. None of them failed a test before,
// because a test that clicks a control proves nothing about whether a rest on it
// does anything — so everything here is driven by resting, never by clicking,
// except where a click is the thing being told apart from a rest.
//
// `tests/app/structure.test.ts` holds the other half: the source may not grow a
// new plain anchor, a new bare input or a new scrolling surface without it being
// a decision somebody made on purpose.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]
const inDoc = <T extends Element = HTMLElement>(sel: string) => [...document.body.querySelectorAll<T>(sel)]
const settle = () => act(() => void vi.advanceTimersByTime(50))

let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

/** Rests on a control for long enough that it fires. No click anywhere in it. */
function rest(el: Element | null | undefined, ms = DEFAULT_SETTINGS.actionDwellMs) {
  if (!el) throw new Error('tried to rest on something that is not rendered')
  fireEvent.pointerEnter(el)
  act(() => void vi.advanceTimersByTime(ms + 50))
}

/** Whether resting on it starts anything at all. */
const arms = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing there to rest on')
  fireEvent.pointerEnter(el)
  return /\bdwelling\b/.test(el.className)
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'

function renderApp(store: Record<string, unknown> = {}) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify({ autoSpeak: false }))
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
  container = render(<App />).container
  settle()
  // Out of auto-speak and into composing: two dwells round the mode ring.
  click($('.edit-toggle'))
  click($('.edit-toggle'))
}

const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
const openPanel = (name: string) => {
  openMenu()
  click($$('.nav-item').find(n => n.getAttribute('aria-label') === name))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // Defined on the prototype by the backup tests, which `restoreAllMocks` does
  // not reach; left there it would answer for every input in the next file.
  delete (HTMLInputElement.prototype as { showPicker?: unknown }).showPicker
})

describe('fields that take the caret by dwell', () => {
  /**
   * **The rows that set up an account.** The ElevenLabs key, the Anthropic key
   * and the sync passphrase all took the caret only on a click — so Peri's own
   * keyboard, which types into whatever field has the caret, could not reach
   * them, and setting any of the three up was a carer's job.
   */
  it.each(['ElevenLabs API key', 'Suggested replies API key', 'Synchronize passphrase'])(
    'lets a rest put the caret in the %s',
    label => {
      renderApp()
      openPanel('Settings')
      // The sync row asks for a passphrase only once it is being started.
      if (label === 'Synchronize passphrase') {
        click($$('.panel-btn').find(b => /^start/i.test(b.getAttribute('aria-label') ?? '')))
      }
      const field = $$<HTMLInputElement>('input').find(i => i.getAttribute('aria-label') === label)
      expect(field, `no ${label} field on screen`).toBeDefined()
      expect(arms(field), `resting on the ${label} does nothing`).toBe(true)
    },
  )

  // Focused on arrival, so it could be typed into — but only at wherever that
  // left the caret. Fixing a letter in the middle of a name needed a click.
  it("lets a rest put the caret in a category's name", () => {
    renderApp()
    click($('.edit-toggle'))
    click($('.add-category-tab'))
    expect(arms($('.edit-modal-input'))).toBe(true)
  })

  /**
   * The figures between − and +. **Text rather than `number`**, and that is the
   * half worth holding: a number field refuses `setSelectionRange`, which is how
   * a dwell places the caret, so the first rest to fire on one would have thrown.
   */
  it('lets a rest put the caret in a setting typed as figures', () => {
    renderApp()
    openPanel('Settings')
    const figures = $<HTMLInputElement>('.setting-number')!
    expect(figures.type, 'a number field cannot take a caret placed by dwell').toBe('text')
    expect(figures.inputMode).toBe('numeric')
    expect(arms(figures)).toBe(true)
  })
})

describe('links a dwell can follow', () => {
  /**
   * Every one of these was a plain anchor, which answers to a press. The guide's
   * pair led to a page with no way back that a dwell could take — see the legal
   * tests in `App.test.tsx` for the other side of that.
   */
  it('makes the policy links in the guide answer to a rest', () => {
    renderApp()
    openPanel('Help')
    const links = $$('.help-legal-links a')
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/privacy', '/terms'])
    for (const link of links) expect(arms(link), `${link.textContent} answers to nothing`).toBe(true)
  })
})

describe('lists a dwell can scroll', () => {
  /**
   * **The chooser somebody opens to say which part of them hurts.** `{bodyparts}`
   * is fifty words, the picker is a screen, and it scrolled by wheel alone — so
   * most of the words sat below the fold with nothing a gaze could use to reach
   * them. Its options are in a pane with dwell controls now, and the preview and
   * Cancel stay put either side of it.
   */
  it('puts a long slot list in a pane that scrolls by dwell', () => {
    renderApp({ custom: [{ id: 'custom-wash', text: 'Can you help me wash my {bodyparts}?', category: 'Care' }] })
    click($$('.filter-tab').find(t => t.textContent === 'Care'))
    click($$('.phrase-cell').find(c => /wash my/.test(c.textContent ?? '')))

    const picker = $('.slot-picker')!
    expect(picker, 'the chooser did not open').not.toBeNull()
    expect(
      picker.querySelector('.scroll-pane .slot-options .slot-option'),
      'the options are not in a pane',
    ).not.toBeNull()
    // Neither the words chosen so far nor the way out scrolls away with them.
    expect(picker.querySelector(':scope > .slot-picker-preview')).not.toBeNull()
    expect(picker.querySelector(':scope > .slot-cancel')).not.toBeNull()
  })
})

describe('the two text boxes, past their cap', () => {
  /**
   * A box that is holding more than it shows. jsdom lays nothing out, so the
   * geometry is supplied — the bargain the paging tests make — and what is under
   * test is what the app does with it.
   */
  const overflowing = (box: HTMLTextAreaElement) => {
    Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 150 })
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => 0 })
  }
  const arrow = (label: RegExp) =>
    $$('.box-scroll .pane-scroll-btn').find(b => label.test(b.getAttribute('aria-label') ?? ''))

  /**
   * **The last surface here with no way to scroll it by dwell.** Both boxes grow
   * to a cap and scroll past it, and a textarea holds no children, so there was
   * nowhere to hang the controls a pane puts above and below its content. They go
   * inside the box's right edge instead, only while there is more to show.
   */
  it('offers a way down a message longer than the box', () => {
    renderApp()
    const box = $<HTMLTextAreaElement>('.text-display')!
    expect($('.box-scroll'), 'arrows with nothing to scroll').toBeNull()

    overflowing(box)
    fireEvent.change(box, { target: { value: 'a message a great deal longer than five lines of the box' } })
    settle()

    const down = arrow(/scroll the message down/i)
    expect(down, 'no way down a message past the fold').toBeDefined()
    expect(box.classList.contains('has-scroll'), 'the words run on under the arrows').toBe(true)

    const scrolled = vi.spyOn(Element.prototype, 'scrollBy')
    rest(down)
    expect(scrolled).toHaveBeenCalled()
  })

  // The way up keeps its place with nowhere to go, rather than coming and going
  // and moving the way down under a pointer resting on it.
  it('keeps the way up in its place while there is nothing above', () => {
    renderApp()
    const box = $<HTMLTextAreaElement>('.text-display')!
    overflowing(box)
    fireEvent.change(box, { target: { value: 'long enough' } })
    settle()

    expect($$('.box-scroll .box-scroll-slot')).toHaveLength(2)
    expect(arrow(/scroll the message up/i), 'offered a way up with nothing above').toBeUndefined()
    expect($('.box-scroll .box-scroll-slot.is-idle')).not.toBeNull()
  })
})

describe('choosing a backup file', () => {
  const chooseFile = () => $$('.panel-btn').find(b => b.getAttribute('aria-label') === 'Choose a file')

  /**
   * **It was a label wrapped round a hidden input**, which a rest did nothing to
   * at all. It is a dwell control in front of one now, and a rest asks the
   * browser for the picker the same way a click would.
   */
  it('asks for the picker when rested on', () => {
    renderApp()
    openPanel('Backup & sharing')
    const picker = vi.fn()
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: picker })

    rest(chooseFile())
    expect(picker).toHaveBeenCalledTimes(1)
  })

  /**
   * The browser only opens a picker for a real press, and a dwell is a timer, so
   * for somebody working the board by gaze alone this is refused every time —
   * which used to happen in silence. It says so, and names the way that works.
   */
  it('says what to do instead when the browser refuses', () => {
    renderApp()
    openPanel('Backup & sharing')
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: () => {
        throw new DOMException('needs a user gesture', 'NotAllowedError')
      },
    })

    rest(chooseFile())
    expect(inDoc('.backup-error')[0]?.textContent).toMatch(/paste a backup/i)
  })

  // One target, not two: the input is where the picker hands its answer back and
  // nothing a pointer or a keyboard can land on.
  it('hides the input itself from anything that aims', () => {
    renderApp()
    openPanel('Backup & sharing')
    const input = $<HTMLInputElement>('input[type="file"]')!
    expect(input.tabIndex).toBe(-1)
    expect(input.getAttribute('aria-hidden')).toBe('true')
  })
})
