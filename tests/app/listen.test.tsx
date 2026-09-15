import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { saveReplyKey } from '../../src/core/store'
import { spoken } from '../setup'
import { FakeRecognition, installRecognition, removeRecognition } from '../listen/fake-recognition'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Listen mode, driven through the real board.
//
// Most of this file is about what must **not** happen. A machine offering words
// for somebody to say is one step from a machine deciding what they meant, so
// the rules that matter are: a suggestion is never spoken, it is always one
// dwell from being undone, and every one of the three services behind this can
// fail without costing anybody a phrase.

let container: HTMLElement

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...container.querySelectorAll<T>(sel)]

const settle = () => act(() => void vi.advanceTimersByTime(50))

let pointerAt = 0
function click(el: Element | null | undefined) {
  if (!el) throw new Error('tried to click something that is not rendered')
  pointerAt = (pointerAt + 200) % 1000
  fireEvent.pointerMove(document.body, { clientX: pointerAt, clientY: 300 })
  fireEvent.click(el)
  settle()
}

const STORE_KEY = 'dwellspeak_phrase_store_v2'
const BOARD = [{ id: 'custom-a', text: 'Apple', category: 'Sorted' }]

function renderApp(settings: Record<string, unknown> = {}) {
  localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
  localStorage.setItem('dwellspeak_settings', JSON.stringify({ autoSpeak: false, ...settings }))
  localStorage.setItem(STORE_KEY, JSON.stringify({ custom: BOARD }))
  container = render(<App />).container
  settle()
  // The board opens in auto-speak whatever was stored, so a test about what
  // lands in the message box has to switch out of it: two dwells on the edit
  // toggle, auto-speak to edit to composing.
  if (settings.autoSpeak !== true) {
    click($('.edit-toggle'))
    click($('.edit-toggle'))
  }
}

const micBtn = () => $('.listen-toggle')
const heardBox = () => $<HTMLTextAreaElement>('.heard-text')
const messageBox = () => $<HTMLTextAreaElement>('.text-display')!
const tool = (label: RegExp) => $$('.heard-btn').find(b => label.test(b.getAttribute('aria-label') ?? ''))
const listenAgain = () => tool(/listen again|dwell to start again/i)
const translateBtn = () => tool(/own language/i)
const suggestBtn = () => tool(/suggest a reply/i)

/** Opens listen mode and delivers a question. */
function hear(question: string) {
  click(micBtn())
  act(() => FakeRecognition.last!.say({ transcript: question, isFinal: true }))
  settle()
}

const answers = (body: unknown, status = 200) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

const suggests = (text: string) => answers({ content: [{ type: 'text', text }] })
const translates = (text: string) => answers({ data: { translations: [{ translatedText: text }] } })

beforeEach(() => {
  vi.useFakeTimers()
  installRecognition()
})
afterEach(() => {
  vi.useRealTimers()
  removeRecognition()
})

describe('the control', () => {
  /**
   * The three corners of the box's top border are now all spoken for, and each
   * holds a different kind of thing: a mode in the middle, a value at the right,
   * and at the left the one control that opens a surface of its own.
   */
  it('sits at the box’s upper-left corner, and nothing else moved', () => {
    renderApp()
    expect($('.topbar-listen .listen-toggle')).not.toBeNull()
    // The modes strip holds exactly three and nothing may be inserted into it.
    expect($$('.topbar-modes > *')).toHaveLength(3)
  })

  // A button that does nothing is worse than no button, and on a board aimed at
  // by gaze it is a target spent for nothing.
  it('is not drawn at all where the browser cannot listen', () => {
    removeRecognition()
    renderApp()
    expect(micBtn()).toBeNull()
  })

  /**
   * The microphone does not move when it is used.
   *
   * On a wide screen the heard box sits *beside* the message rather than above
   * it, so the leftmost box on that border changes the moment listen mode opens.
   * What stops the control moving with it is that it hangs off the wrapper
   * rather than off either box, and the wrapper is the same size in the same
   * place either way — so the microphone rides the message box's corner while it
   * is closed and the heard box's while it is open, at one point on screen.
   *
   * It is the way *out* of listen mode as well as the way in, which is what
   * makes this worth holding: a control that moved the moment somebody used it
   * would be the worst one on this bar to have to hunt for.
   */
  it('hangs off the wrapper rather than off either box, so it does not move', () => {
    renderApp()
    const wrap = $('.text-display-wrap')!
    expect(wrap.querySelector(':scope > .topbar-listen')).not.toBeNull()

    click(micBtn())
    expect(heardBox()).not.toBeNull()
    // Still the wrapper's own child, and not something the heard box brought
    // with it — which is the only reason the two states put it in one place.
    expect(wrap.querySelector(':scope > .topbar-listen')).not.toBeNull()
    expect($('.heard-wrap .topbar-listen')).toBeNull()
  })

  /**
   * The three controls ride the heard box's lower border.
   *
   * On the border rather than in a row beneath it, so the box costs the board the
   * height of a box and not the height of a box and a toolbar — which matters
   * more here than on any other strip, since what is underneath is the board
   * somebody answers the question from.
   *
   * The testable half is the order: riding the border means sitting between the
   * box and what comes under it, and the CSS pulls them up from there. Whether
   * they land *on* the line is a question for the deploy preview, jsdom laying
   * nothing out.
   */
  it('rides the box lower border, between it and what is written under it', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', translates('Do you want tea?'))
    renderApp({ language: 'es' })
    hear('¿Quieres té?')

    click(translateBtn())
    await act(async () => {})

    const inOrder = [...$('.heard-wrap')!.children].map(el => el.className.split(' ')[0])
    expect(inOrder).toEqual(['heard-text', 'heard-tools', 'heard-meaning'])
  })

  /**
   * **The two boxes are one height, and whichever holds more decides it.**
   *
   * Side by side on a wide screen, two boxes of somebody's speech at different
   * heights read as two unrelated things rather than as the two halves of one
   * exchange — the question is not a caption on the answer. And both have to
   * grow, because neither has a dwell control for scrolling and nothing to hang
   * one on, so what a fixed box cuts off is out of reach.
   *
   * jsdom lays nothing out, so the heights are supplied — the same bargain the
   * paging tests and the message box's own growing tests make. What is under
   * test is what the app does with them.
   */
  it('grows both boxes together, to whichever is holding more', () => {
    renderApp()
    click(micBtn())

    const measures = (el: HTMLTextAreaElement, lines: number) =>
      Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        // Read only once the height has been cleared, which is the one moment a
        // box can be measured for the text in it rather than for its own room.
        get(this: HTMLTextAreaElement) {
          return this.style.height === '' ? (this.value ? lines * 28 : 28) : 999
        },
      })

    measures(heardBox()!, 3)
    measures(messageBox(), 1)

    // A long question and nothing written back yet: both take the question's
    // height rather than the question standing tall beside an empty answer.
    act(() => FakeRecognition.last!.say({ transcript: 'a question over three lines', isFinal: true }))
    settle()
    expect(heardBox()!.style.height).toBe('84px')
    expect(messageBox().style.height).toBe('84px')

    // And the other way about, which is the half that says the height is the
    // pair's rather than the question's.
    measures(heardBox()!, 1)
    measures(messageBox(), 5)
    fireEvent.change(messageBox(), { target: { value: 'a message over five lines' } })
    settle()
    expect(messageBox().style.height).toBe('140px')
    expect(heardBox()!.style.height).toBe('140px')
  })

  /**
   * **The question box is the message box's twin.**
   *
   * Same type, same padding, same floor, same cap. It was a third smaller with
   * tighter padding, which made a hierarchy out of what is really two halves of
   * one conversation — and the question is the half the person using the board
   * did not write and has the most trouble following.
   *
   * The floor and the cap are not decoration. The two boxes are held to one
   * height by measurement, and measurement only decides anything between the
   * two: below the floor and above the cap it is the stylesheet that answers, so
   * a pair with different floors is a pair that comes apart while both are empty
   * and a pair with different caps is one that comes apart when either fills up.
   *
   * Held here rather than left to the eye because it is seven declarations in
   * two rules two hundred lines apart, and a diff shows nothing.
   */
  it('is the message box twin, in type and in the numbers that bound it', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const WANTED = [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'max-height',
      'min-height',
      'padding',
    ]

    const shape = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      const block = rule.slice(0, rule.indexOf('}'))
      return Object.fromEntries(
        [...block.matchAll(/^ *([a-z-]+): *([^;]+);/gm)]
          .filter(m => WANTED.includes(m[1]!))
          .map(m => [m[1], m[2]]),
      )
    }

    const message = shape('.text-display')
    expect(
      Object.keys(message).sort(),
      'the message box no longer states all seven — this can only compare what is there',
    ).toEqual(WANTED)
    expect(shape('.heard-text'), 'the two boxes are not the same box').toEqual(message)
  })

  // They sit *on* a border now, and a control painted on one with nothing behind
  // it shows the border and the words through — the reason `.topbar-modes` is
  // opaque. A ground each rather than one pill: two rem apart, one pill would be
  // wider than the pane the wide-screen split gives this box.
  it('paints a ground under each of them', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const rule = css.slice(css.indexOf('.heard-btn {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/background: *#000/)
  })

  it('opens a box above the message, and closes it again', () => {
    renderApp()
    expect(heardBox()).toBeNull()

    click(micBtn())
    expect(heardBox()).not.toBeNull()

    click(micBtn())
    expect(heardBox()).toBeNull()
  })

  it('starts listening when it opens, and stops when it closes', () => {
    renderApp()
    click(micBtn())
    expect(FakeRecognition.last!.started).toBe(true)

    click(micBtn())
    expect(FakeRecognition.last!.stopped).toBe(true)
  })

  it('listens in the language the board is spoken in', () => {
    renderApp({ language: 'es-PR' })
    click(micBtn())
    expect(FakeRecognition.last!.lang).toBe('es-PR')
  })
})

describe('the question', () => {
  it('fills the box as the words arrive', () => {
    renderApp()
    click(micBtn())

    act(() => FakeRecognition.last!.say({ transcript: 'Do you want', isFinal: false }))
    expect(heardBox()!.value).toBe('Do you want')

    act(() => FakeRecognition.last!.say({ transcript: 'Do you want tea?', isFinal: true }))
    expect(heardBox()!.value).toBe('Do you want tea?')
  })

  // A recogniser mis-hears names, and the box is a text area for that reason.
  it('can be corrected by hand', () => {
    renderApp()
    hear('Do you want tea or coffee')
    fireEvent.change(heardBox()!, { target: { value: 'Do you want tea or toffee?' } })
    settle()
    expect(heardBox()!.value).toBe('Do you want tea or toffee?')
  })

  it('can be listened for again', () => {
    renderApp()
    hear('Do you want tea?')
    const before = FakeRecognition.made

    click(listenAgain())

    expect(FakeRecognition.made).toBe(before + 1)
    expect(heardBox()!.value).toBe('')
  })

  it('says so when the microphone is refused, and keeps the board working', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.fail('not-allowed'))
    settle()

    expect($('.heard-error')?.textContent).toMatch(/allow it for Peri/i)
    click($$('.phrase-cell')[0])
    expect(messageBox().value).not.toBe('')
  })
})

describe('reading it in your own language', () => {
  it('puts the meaning under the words that were said', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', translates('Do you want tea?'))
    renderApp({ language: 'es' })
    hear('¿Quieres té?')

    click(translateBtn())
    await act(async () => {})

    expect($('.heard-meaning')?.textContent).toBe('Do you want tea?')
    // The words that were said stay where they are. A carer can point at what
    // they actually asked.
    expect(heardBox()!.value).toBe('¿Quieres té?')
  })

  // A correction makes the meaning stale, and a stale translation under a
  // changed question is worse than none.
  it('drops the meaning when the question is corrected', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', translates('Do you want tea?'))
    renderApp({ language: 'es' })
    hear('¿Quieres té?')
    click(translateBtn())
    await act(async () => {})
    expect($('.heard-meaning')).not.toBeNull()

    fireEvent.change(heardBox()!, { target: { value: '¿Quieres café?' } })
    settle()

    expect($('.heard-meaning')).toBeNull()
  })

  it('says so when the service will not answer, and leaves the words alone', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    renderApp({ language: 'es' })
    hear('¿Quieres té?')

    click(translateBtn())
    await act(async () => {})

    expect($('.heard-error')).not.toBeNull()
    expect(heardBox()!.value).toBe('¿Quieres té?')
  })
})

describe('the suggested reply', () => {
  const withKey = (settings: Record<string, unknown> = {}) => {
    saveReplyKey('sk-ant-test')
    renderApp(settings)
  }

  it('is not offered at all until a key is set up', () => {
    renderApp()
    hear('Do you want tea?')
    expect(suggestBtn()).toBeUndefined()
  })

  it('goes into the message box', async () => {
    vi.stubGlobal('fetch', suggests('Tea please'))
    withKey()
    hear('Do you want tea or coffee?')

    click(suggestBtn())
    await act(async () => {})

    expect(messageBox().value).toBe('Tea please')
  })

  /**
   * **The rule the whole feature rests on.** A suggestion is words a machine
   * offered, and it is said only when the person dwells on Speak, like any other
   * message. Asserted with auto-speak on, which is the mode where everything
   * else on the board is spoken the moment it is chosen.
   */
  it('is never spoken, not even with auto-speak on', async () => {
    vi.stubGlobal('fetch', suggests('Tea please'))
    withKey({ autoSpeak: true })
    hear('Do you want tea or coffee?')

    click(suggestBtn())
    await act(async () => {})

    expect(messageBox().value).toBe('Tea please')
    expect(spoken, 'a machine’s words were spoken without being chosen').toEqual([])
  })

  /**
   * **It never writes over words somebody already had.** The composer's undo is
   * a one-step toggle rather than a stack, so a suggestion that replaced a
   * half-written message could not be walked back past it — which would make
   * accepting a machine's words a thing that happened to somebody rather than a
   * thing they chose. So the control goes quiet instead, and says why.
   */
  it('goes quiet rather than writing over a message already there', async () => {
    vi.stubGlobal('fetch', suggests('Tea please'))
    withKey()
    fireEvent.change(messageBox(), { target: { value: 'my own words' } })
    settle()
    hear('Do you want tea?')

    expect(suggestBtn()?.getAttribute('aria-disabled')).toBe('true')
    expect(suggestBtn()?.getAttribute('aria-label')).toMatch(/clear the message/i)

    click(suggestBtn())
    await act(async () => {})
    expect(messageBox().value).toBe('my own words')
  })

  // Cleared by accident, it is one dwell back: the suggestion went into the box
  // through the composer's own history.
  it('comes back from the box own undo', async () => {
    vi.stubGlobal('fetch', suggests('Tea please'))
    withKey()
    hear('Do you want tea?')
    click(suggestBtn())
    await act(async () => {})

    click($$('.icon-btn').find(b => /clear/i.test(b.getAttribute('aria-label') ?? '')))
    click($$('.icon-btn').find(b => /undo/i.test(b.getAttribute('aria-label') ?? '')))

    expect(messageBox().value).toBe('Tea please')
  })

  it('says so when the service will not answer, and leaves the box alone', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    withKey()
    hear('Do you want tea?')

    click(suggestBtn())
    await act(async () => {})

    expect($('.heard-error')?.textContent).toMatch(/could not reach/i)
    expect(messageBox().value).toBe('')
  })

  it('is written by the model chosen in Settings', async () => {
    const fetcher = suggests('Tea please')
    vi.stubGlobal('fetch', fetcher)
    saveReplyKey('sk-ant-test')
    renderApp({ replyModel: 'claude-opus-5' })
    hear('Do you want tea?')

    click(suggestBtn())
    await act(async () => {})

    const body = JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as {
      model: string
    }
    expect(body.model).toBe('claude-opus-5')
  })

  /**
   * A gap rather than a question back, and the caret lands in it. The fact the
   * model was not told is typed straight into the hole it left — the same
   * landing a fill-in-the-blank phrase off the board gets.
   */
  it('leaves a gap to fill in, with the caret already in it', async () => {
    vi.stubGlobal('fetch', suggests('I took them at ___ this morning'))
    withKey()
    hear('When did you take your tablets?')

    click(suggestBtn())
    await act(async () => {})
    act(() => void vi.advanceTimersByTime(50))

    expect(messageBox().value).toBe('I took them at  this morning')
    expect(messageBox().selectionStart).toBe(15)
  })

  /**
   * "Tea or coffee?" followed by "milk?" is one exchange. A reply to the second
   * that had never seen the first would be answering a different question.
   */
  it('answers the next question as part of the same conversation', async () => {
    const fetcher = suggests('Yes please')
    vi.stubGlobal('fetch', fetcher)
    withKey()

    hear('Tea or coffee?')
    click(suggestBtn())
    await act(async () => {})

    click(listenAgain())
    act(() => FakeRecognition.last!.say({ transcript: 'Milk?', isFinal: true }))
    settle()
    // The box holds the first suggestion, and a suggestion never writes over
    // one — so it goes before the second is asked for.
    click($$('.icon-btn').find(b => /clear/i.test(b.getAttribute('aria-label') ?? '')))
    click(suggestBtn())
    await act(async () => {})

    const second = JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[1][1].body)) as {
      messages: { role: string; content: string }[]
    }
    expect(second.messages.map(m => m.content)).toEqual([
      'Someone just asked me: Tea or coffee?',
      'Yes please',
      'Someone just asked me: Milk?',
    ])
  })

  it('says so when the key is not accepted', async () => {
    vi.stubGlobal('fetch', answers({ error: {} }, 401))
    withKey()
    hear('Do you want tea?')

    click(suggestBtn())
    await act(async () => {})

    expect($('.heard-error')?.textContent).toMatch(/Settings/)
  })

  // Nothing to reply to, and a control that would ask about an empty question.
  it('goes quiet while nothing has been heard', () => {
    withKey()
    click(micBtn())
    expect(suggestBtn()?.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('what listen mode does not touch', () => {
  it('leaves the board working while the box is open', () => {
    renderApp()
    click(micBtn())

    click($$('.phrase-cell')[0])

    expect(messageBox().value).not.toBe('')
  })

  // The box above is somebody else's words. The grid narrows to what is being
  // *composed*, and a caret moved about in a question must not reach it.
  it('does not narrow the board to a word of the question', () => {
    renderApp()
    const before = $$('.phrase-cell').length
    hear('Apple')
    expect($$('.phrase-cell')).toHaveLength(before)
  })

  /**
   * The worst version of this feature is a microphone held open by a component
   * nobody can see. Nothing else in the app can turn it off once the screen that
   * owns it is gone.
   */
  it('stops listening when the screen goes', () => {
    renderApp()
    click(micBtn())
    expect(FakeRecognition.last!.started).toBe(true)

    cleanup()

    expect(FakeRecognition.last!.stopped).toBe(true)
  })

  it('keeps nothing once the box is closed', () => {
    renderApp()
    hear('Do you want tea?')
    click(micBtn())
    click(micBtn())
    expect(heardBox()!.value).toBe('')
  })
})
