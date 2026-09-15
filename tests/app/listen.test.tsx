import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { saveReplyKey } from '../../src/core/store'
import { spoken } from '../setup'
import { FakeRecognition, installRecognition, removeRecognition } from '../listen/fake-recognition'

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
