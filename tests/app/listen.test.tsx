import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, act } from '@testing-library/react'
import App from '../../src/App'
import { loadReplyContext, saveAnswers, saveReplyKey } from '../../src/core/store'
import { SHIPPED_APOLOGIES, WAITING_MS } from '../../src/listen/apology'
import { PROSE_ICONS } from '../../src/ui/prose-icons'
import { KEY_NOTICE } from '../../src/talk/use-listen'
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

/**
 * The board, with an Anthropic key unless a test says otherwise: without one
 * the question box takes nothing — see `KEY_NOTICE` — so almost every test here
 * needs one to have a box that listens at all.
 */
function renderApp(settings: Record<string, unknown> = {}, { key = 'sk-ant-test' }: { key?: string } = {}) {
  if (key) saveReplyKey(key)
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

const openSettings = () => {
  click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
}
const answersRow = () => $$('.setting-row').find(r => r.textContent?.includes('Suggested answers'))!
/** Types a key into the Suggested answers row, where there is none set. */
const typeKey = (key: string) =>
  fireEvent.change(answersRow().querySelector('input[aria-label="Suggested answers API key"]')!, {
    target: { value: key },
  })

const micBtn = () => $('.listen-toggle')
const editToggle = () => $('.edit-toggle')!
const speakToggle = () => $('.autospeak-toggle')!
const speaking = () => speakToggle().getAttribute('aria-pressed') === 'true'
const heardBox = () => $<HTMLTextAreaElement>('.heard-text')
const messageBox = () => $<HTMLTextAreaElement>('.text-display')!
const tool = (label: RegExp) => $$('.heard-btn').find(b => label.test(b.getAttribute('aria-label') ?? ''))
const clearHeard = () => tool(/^clear/i)
const undoHeard = () => tool(/^undo/i)
const translateBtn = () => tool(/own language/i)
const suggestBtn = () => tool(/suggest answers/i)

/** The answers on the board, which is where they land — never the message box. */
const answerCells = () => $$('.phrase-cell').map(c => c.textContent ?? '')
const answerTab = () => $$('.filter-tab').find(t => (t.textContent ?? '').startsWith('Answers'))
const waitingLine = () => $('.grid-empty.is-busy')
/** Rests on the answer whose words these are. */
const chooseAnswer = (text: string) => click($$('.phrase-cell').find(c => c.textContent === text))

/** Opens listen mode and delivers a question, the recogniser still running. */
function hear(question: string) {
  click(micBtn())
  act(() => FakeRecognition.last!.say({ transcript: question, isFinal: true }))
  settle()
}

/**
 * The same, and then the recogniser stops — which is what somebody stopping
 * talking looks like, and the moment a question is answered without being asked
 * to be.
 */
function heardAndDone(question: string) {
  hear(question)
  act(() => FakeRecognition.last!.finish())
  settle()
}

const answers = (body: unknown, status = 200) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

const suggests = (text: string) => answers({ content: [{ type: 'text', text }] })
/** One answer from the service, for a fetch that says something different each time. */
const answered = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
    headers: { 'content-type': 'application/json' },
  })
const translates = (text: string) => answers({ data: { translations: [{ translatedText: text }] } })

beforeEach(() => {
  vi.useFakeTimers()
  installRecognition()
  // Nothing here reaches Anthropic: a question answered by itself in a test
  // that never meant to ask goes nowhere, rather than out over the network.
  // Tests that are about the answers put their own in its place.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  )
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

  /**
   * **A guide that names a button has to show it.** The control is a glyph and
   * nothing else, and the guide draws the same glyph wherever it says `:listen:`
   * — so a change to one that missed the other would leave somebody matching a
   * picture in the guide against a different picture on the board.
   */
  it('draws the glyph the guide shows for it', () => {
    renderApp()
    const drawn = micBtn()!.querySelector('svg')!.outerHTML
    const Guide = PROSE_ICONS.listen!
    const inGuide = render(<Guide />).container.querySelector('svg')!.outerHTML
    expect(drawn).toBe(inGuide)
  })

  // The box takes a question typed as readily as one heard, so while it waits
  // it says both — "Listening…" told somebody who cannot speak to it nothing
  // about the half of it they could use.
  it('asks for a question, spoken or typed, while it listens', () => {
    renderApp()
    click(micBtn())
    expect(heardBox()!.placeholder).toBe('Speak or type a question')

    // And says so plainly once it has stopped: nothing is listening any more,
    // so asking to be spoken to would be asking for something that will not
    // be heard.
    act(() => FakeRecognition.last!.finish())
    settle()
    expect(heardBox()!.placeholder).toBe('Nothing heard yet')
  })

  /**
   * **A microphone while sound is actually coming in, and at no other time** —
   * so there is nothing to read it as but *this is being heard now*. At the
   * right end of the box's lower border, after the tools.
   *
   * **Not when listening is asked for.** The browser asks for permission first,
   * and a light that came on then said the microphone was live while nothing was
   * being heard; and it stops taking sound before the session ends.
   */
  it('shows a live microphone in the box’s lower right corner only while sound comes in', () => {
    const live = () => $('.heard-live')
    renderApp()
    click(micBtn())
    expect(live(), 'live before the browser had the microphone').toBeNull()

    act(() => FakeRecognition.last!.soundStarts())
    settle()
    expect(live(), 'not shown while sound came in').not.toBeNull()
    expect($('.heard-tools > :last-child')).toBe(live())
    expect(live()!.getAttribute('aria-label')).toBe('The microphone is on')

    act(() => FakeRecognition.last!.say({ transcript: 'Tea', isFinal: false }))
    settle()
    expect(live(), 'went out while it was still hearing').not.toBeNull()

    act(() => FakeRecognition.last!.soundEnds())
    settle()
    expect(live(), 'still shown with no sound coming in').toBeNull()
    expect(heardBox()!.placeholder, 'the session ended with the sound').toBe('Speak or type a question')

    // And back with the sound, and gone with the session however it ends.
    act(() => FakeRecognition.last!.soundStarts())
    settle()
    expect(live()).not.toBeNull()
    click(micBtn())
    expect(live()).toBeNull()
  })

  // Not a control: nothing to do to it that the tools beside it do not already
  // do, and a target that did nothing would be a dwell spent for nothing.
  it('is a light and not a control', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.soundStarts())
    settle()
    const live = $('.heard-live')!
    expect(live.tagName).toBe('SPAN')
    expect(live.hasAttribute('tabindex')).toBe(false)
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.slice(css.indexOf('.heard-live {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/pointer-events: *none/)
  })

  /**
   * **Only the level inside the capsule moves**, rising and falling as a meter
   * does. The light pulsed at first, and its ground dimmed with it so the box's
   * border showed through, and its glow lay on the border — the border itself
   * seemed to pulse. So the light's own box is solid and holds still: no
   * animation, no glow, no fading. And the level stops for somebody whose device
   * asks for less motion.
   */
  it('moves only a level inside the capsule, and holds it still for reduced motion', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.soundStarts())
    settle()
    expect($('.heard-live .mic-level'), 'no level in the capsule').not.toBeNull()

    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const block = (selector: string) => {
      const rule = css.slice(css.indexOf(`${selector} {`))
      return rule.slice(0, rule.indexOf('}'))
    }
    expect(block('.heard-live .mic-level')).toMatch(/animation: *micLevel [\d.]+s [\w-]+ infinite/)
    const level = css.slice(css.indexOf('@keyframes micLevel'))
    const frames = level.slice(0, level.indexOf('}\n}'))
    expect(frames.match(/[\w-]+(?=:)/g), 'the level animates something besides its height').toEqual(
      expect.arrayContaining(['transform']),
    )
    expect(frames, 'the level animates something besides its height').not.toMatch(/opacity|shadow|color/)
    expect(block('.heard-live'), 'the light itself moves').not.toMatch(/animation|transition|box-shadow|opacity/)

    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced.slice(0, reduced.indexOf('\n}\n'))).toMatch(/\.heard-live \.mic-level *\{\s*animation: *none/)
  })

  // The guide and the privacy policy both say `:mic:`, and a light the guide
  // draws differently is a light somebody cannot match to it. The guide's stands
  // still, so it is the same outline with no level in it.
  it('draws the glyph the guide and the policy show for it', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.soundStarts())
    settle()
    const drawn = $('.heard-live svg')!.cloneNode(true) as SVGElement
    drawn.querySelector('.mic-level')!.remove()
    const Guide = PROSE_ICONS.mic!
    expect(render(<Guide />).container.querySelector('svg')!.outerHTML).toBe(drawn.outerHTML)
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
   * **The same two glyphs both boxes empty themselves with.**
   *
   * One box is what somebody is being asked and the other is what they are about
   * to say, and a control meaning *empty this* has to look the same on both or
   * it is two controls to learn rather than one.
   *
   * It is the gesture most worth being able to take back here: a recogniser
   * mis-hears, the answer to a question that came out as nonsense is to empty
   * the box, and what that throws away is the only copy of what was said to
   * somebody.
   */
  it('empties and refills with the glyphs the message box uses', () => {
    renderApp()
    click(micBtn())
    expect(clearHeard()?.getAttribute('aria-disabled'), 'offered with nothing to empty').toBe('true')

    act(() => FakeRecognition.last!.say({ transcript: 'Do you want tea', isFinal: true }))
    settle()
    click(clearHeard())
    expect(heardBox()!.value).toBe('')

    // And back, which is the half that matters: the words were somebody else's
    // and there is no second copy of them anywhere.
    click(undoHeard())
    expect(heardBox()!.value).toBe('Do you want tea')
  })

  /**
   * **The one control works the microphone too, which is why there is no button
   * for it.**
   *
   * Emptying this box has one reason behind it — what came back was wrong — and
   * what somebody wants next is to be listened to again. Undo is that decision
   * taken back, so it stops. A row with a listen button in it asked somebody to
   * make two dwells out of one intention.
   */
  it('listens again on clear, and stops on undo', () => {
    renderApp()
    hear('Do you want tea')
    const before = FakeRecognition.made

    click(clearHeard())
    expect(FakeRecognition.made, 'clearing did not start listening again').toBe(before + 1)
    expect(FakeRecognition.last!.started).toBe(true)

    click(undoHeard())
    expect(FakeRecognition.last!.stopped, 'undo left the microphone open').toBe(true)
    expect(heardBox()!.value).toBe('Do you want tea')
  })

  /**
   * **Opening the microphone puts the board in auto-speak.**
   *
   * Somebody has just been spoken to and is about to answer, with a person
   * waiting in front of them — which is the whole of what auto-speak is for.
   * The alternative is a board that hears a question and then wants a second
   * dwell somewhere else before it can say anything back, which is the same
   * cost the automatic asking exists to save.
   */
  it('puts the board in auto-speak on the way in', () => {
    renderApp()
    expect(speaking(), 'the board was already talking, so this proves nothing').toBe(false)

    click(micBtn())
    expect(speaking()).toBe(true)
  })

  /**
   * And it says nothing where the board was already talking, which is where it
   * usually is: the toast is the app saying what mode it is now in, and the
   * pointer here is somebody's gaze — a line appearing about a change nobody
   * made does not merely distract, it aims.
   */
  it('says nothing when the board is already talking', () => {
    renderApp({ autoSpeak: true })
    click(micBtn())

    expect(speaking()).toBe(true)
    expect($('.toast')?.textContent ?? '').toBe('')
  })

  // Only on the way in. A conversation that has ended is not a reason to stop
  // talking, and a control that undid itself on the way out would take away a
  // mode somebody had chosen in the middle of one.
  it('leaves the mode alone on the way out', () => {
    renderApp()
    click(micBtn())
    click(speakToggle()) // back to composing, mid-conversation
    click(micBtn()) // and out

    expect(speaking(), 'closing the box put auto-speak back on').toBe(false)
  })

  /**
   * It takes the board out of edit mode as a consequence, those two never being
   * on together.
   *
   * Right rather than incidental: a question in the room is not a moment to be
   * rewriting phrases. What it costs is the blank draft that dwelling on
   * auto-speak itself would have cost.
   */
  it('takes the board out of edit mode', () => {
    renderApp()
    click(editToggle())
    expect($('.app')?.classList.contains('edit-mode')).toBe(true)

    click(micBtn())
    expect($('.app')?.classList.contains('edit-mode')).toBe(false)
    expect(speaking()).toBe(true)
  })

  // Opening the box is a box with nothing behind it. An undo reaching past the
  // opening into the last conversation would put back words nobody is talking
  // about any more.
  it('has nothing to put back in a box just opened', () => {
    renderApp()
    hear('Do you want tea')
    click(clearHeard())
    click(micBtn())
    click(micBtn())

    expect(undoHeard(), 'an undo survived the box being closed and opened').toBeUndefined()
    expect(clearHeard()?.getAttribute('aria-disabled')).toBe('true')
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
    expect(inOrder).toEqual(['heard-field', 'heard-tools', 'heard-meaning'])
    expect($('.heard-field > .heard-text'), 'the box is not the first thing in its field').not.toBeNull()

    // Empty first, then the ones that do something with what is in the box. The
    // rest of the row depends on what this build and this board can do, so only
    // the two that are always there are named.
    const tools = $$('.heard-tools .heard-btn').map(b => b.getAttribute('aria-label') ?? '')
    expect(tools[0], 'the control that empties the box is not first').toMatch(/^clear/i)
    // And nothing aims at the microphone: clearing starts it, undo stops it.
    expect(
      tools.filter(l => /^listen/i.test(l)),
      'something still aims at the microphone',
    ).toEqual([])
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

  // A ground each rather than one pill round all three — two rem apart, one pill
  // would be wider than the pane the wide-screen split gives this box — and the
  // same ground every other control on either box's border stands on.
  it('paints a ground under each of them', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const rule = css.slice(css.indexOf('.heard-btn {'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/background: *var\(--border-ground\)/)
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

  /**
   * **Typing stops the microphone.** Whoever is typing is saying what the
   * question is, and a recogniser left running would write the next thing it
   * heard over what they typed. What it had heard is not answered on its way
   * out either: a typed question is asked about when somebody asks.
   */
  it('stops listening the moment anything is typed, and answers nothing it had heard', async () => {
    const fetch = suggests('Yes please')
    vi.stubGlobal('fetch', fetch)
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.soundStarts())
    act(() => FakeRecognition.last!.say({ transcript: 'Do you want', isFinal: false }))
    settle()

    fireEvent.change(heardBox()!, { target: { value: 'Do you want toast?' } })
    settle()
    expect(FakeRecognition.last!.stopped, 'still listening after a letter was typed').toBe(true)
    expect($('.heard-live'), 'still showing the microphone live').toBeNull()
    expect(heardBox()!.classList.contains('is-listening')).toBe(false)
    expect(heardBox()!.placeholder).toBe('Nothing heard yet')

    // Anything it hears on its way out lands nowhere.
    act(() => FakeRecognition.last!.say({ transcript: 'Do you want tea', isFinal: true }))
    settle()
    await act(async () => {})
    expect(heardBox()!.value).toBe('Do you want toast?')
    expect(fetch, 'what it had heard was answered without being asked').not.toHaveBeenCalled()
  })

  it('can be listened for again, by emptying the box', () => {
    renderApp()
    hear('Do you want tea?')
    const before = FakeRecognition.made

    click(clearHeard())

    expect(FakeRecognition.made).toBe(before + 1)
    expect(heardBox()!.value).toBe('')
  })

  it('says so when the microphone is refused, and keeps the board working', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.fail('not-allowed'))
    settle()

    expect($('.heard-error')?.textContent).toMatch(/allow it for Peri/i)
    // A refused microphone costs the microphone and nothing else: the board is
    // in auto-speak, because opening it asked for that, and a phrase chosen on
    // it is still said.
    const cell = $$('.phrase-cell')[0]!
    click(cell)
    expect(spoken).toEqual([cell.textContent])
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

/**
 * **Three seconds is a long silence with somebody standing in front of you.**
 * The person using the board cannot fill it — filling it is what they came here
 * for — so the board fills it for them, once, while the answers are still on
 * their way. See `listen/apology.ts`.
 */
describe('what the board says while a reply is being written', () => {
  /** A reply that does not come back until it is let go of. */
  const heldReply = () => {
    let answer!: (text: string) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            answer = text =>
              resolve(
                new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
                  headers: { 'content-type': 'application/json' },
                }),
              )
          }),
      ),
    )
    saveReplyKey('sk-ant-test')
    renderApp()
    return { answer: () => answer('I am, thank you') }
  }

  const waitOut = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('apologises out loud once the wait is longer than three seconds', () => {
    heldReply()
    heardAndDone('Are you comfortable')
    expect(spoken, 'it spoke before anybody had waited for anything').toEqual([])

    waitOut(WAITING_MS + 100)

    expect(spoken).toHaveLength(1)
    expect(SHIPPED_APOLOGIES).toContain(spoken[0])
  })

  it('says it once, however long the wait goes on', () => {
    heldReply()
    heardAndDone('Are you comfortable')

    waitOut(WAITING_MS * 5)

    expect(spoken).toHaveLength(1)
  })

  // The answers are what somebody was waiting for, and they are never spoken.
  it('says nothing at all when the answers come back in time', async () => {
    const held = heldReply()
    heardAndDone('Are you comfortable')

    waitOut(WAITING_MS - 500)
    await act(async () => held.answer())
    waitOut(WAITING_MS * 2)

    expect(spoken).toEqual([])
    expect(answerCells()).toEqual(['I am, thank you'])
  })

  /**
   * **It is the board's sentence, not theirs.** It goes nowhere near the record
   * of what they said, counts towards no phrase, and is not in the conversation
   * the next reply is written against.
   */
  it('is not treated as something the person said', () => {
    heldReply()
    heardAndDone('Are you comfortable')
    waitOut(WAITING_MS + 100)

    expect(spoken).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('peri_sent') ?? '[]'), 'the apology is in the Sent list').toEqual([])
    expect(JSON.parse(localStorage.getItem('peri_usage') ?? '{}')).toEqual({})
    expect(JSON.parse(localStorage.getItem('peri_reply_context') ?? '[]')).toEqual([])
  })

  /**
   * **Topped up after one is said, and at no other time.** A board that never
   * waits on an answer never asks for any; from the first apology on, what it
   * says next was written for this board minutes before anybody needed it.
   */
  it('asks for more of them once it has said one', () => {
    heldReply()
    heardAndDone('Are you comfortable')
    const asked = () => (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(asked(), 'it asked for apologies before one had ever been needed').toHaveLength(1)

    waitOut(WAITING_MS + 100)

    expect(asked()).toHaveLength(2)
    const body = JSON.parse(String(asked()[1][1].body)) as { system?: unknown; messages: { content: string }[] }
    expect(body.system, 'the fill went out as though it were a question').toBeUndefined()
    expect(body.messages[0].content).toMatch(/apolog/i)
  })

  /**
   * A question that has been corrected, or cleared, is one nobody is waiting on
   * an answer to — and an apology for it would be the board talking to itself.
   */
  it('says nothing for a question that is no longer the one being answered', () => {
    heldReply()
    heardAndDone('Are you comfortable')

    fireEvent.change(heardBox()!, { target: { value: 'Are you comfortable in that chair?' } })
    settle()
    waitOut(WAITING_MS + 100)

    expect(spoken).toEqual([])
  })

  it('writes down what it said, so the next wait is different words', () => {
    heldReply()
    heardAndDone('Are you comfortable')
    waitOut(WAITING_MS + 100)

    const said = JSON.parse(localStorage.getItem('peri_apologies') ?? '{}') as {
      said: { text: string }[]
    }
    expect(said.said.map(s => s.text)).toEqual(spoken)
  })
})

describe('the suggested reply', () => {
  const withKey = (settings: Record<string, unknown> = {}) => {
    saveReplyKey('sk-ant-test')
    renderApp(settings)
  }

  /**
   * **Without a key the box says so, and takes nothing.** It is for getting
   * answers, and the answers are the user's own account — so it listens to
   * nobody and takes no typing, rather than hearing a question and then failing
   * somebody with a person waiting. What it says is where to go, as its words,
   * so the box grows to hold all of it.
   */
  it('says in the box that a key is needed, and takes nothing, until one is set up', async () => {
    renderApp({}, { key: '' })
    click(micBtn())

    expect(heardBox()!.value).toBe(KEY_NOTICE.missing)
    expect(heardBox()!.readOnly, 'the box takes typing with no key').toBe(true)
    expect(heardBox()!.classList.contains('is-notice')).toBe(true)
    expect(FakeRecognition.made, 'something listened with no key').toBe(0)
    expect(suggestBtn()).toBeUndefined()
    expect(clearHeard()?.getAttribute('aria-disabled'), 'clearing would listen').toBe('true')

    // Typed at anyway, by a keyboard that does not check: nothing lands — not
    // now, and not later either, once a key is set up and the box takes words.
    fireEvent.change(heardBox()!, { target: { value: 'Tea?' } })
    settle()
    expect(heardBox()!.value).toBe(KEY_NOTICE.missing)

    vi.stubGlobal('fetch', answers({ data: [] }))
    openSettings()
    typeKey('sk-ant-new')
    click(answersRow().querySelector('[aria-label="Save"]'))
    await act(async () => {})
    settle()
    expect(heardBox()!.value, 'what was typed at the notice came back').toBe('')
    expect(heardBox()!.readOnly).toBe(false)
  })

  /**
   * **A question that settles with nothing in the message box answers itself.**
   *
   * The dwell it saves is the point: somebody mid-conversation has just been
   * spoken to and has a person waiting in front of them, and aiming at a button
   * before the machine will even begin thinking spends the seconds this feature
   * exists to give back.
   *
   * On the recogniser stopping rather than on a final result, because that is the
   * one moment the whole of what was asked is in hand. A final result part-way
   * through is half a question, and a reply to half a question is worse than no
   * reply at all.
   */
  it('answers a settled question on its own, and fills the board with them', async () => {
    const fetch = suggests('I am, thank you\nA bit cold\nCould I have a blanket?')
    vi.stubGlobal('fetch', fetch)
    withKey()

    heardAndDone('Are you comfortable')
    await act(async () => {})

    expect(fetch).toHaveBeenCalledTimes(1)
    // The board goes to them rather than leaving somebody to find the tab: a
    // person is waiting in front of them.
    expect(answerTab(), 'no tab for the answers').toBeDefined()
    expect(answerCells()).toEqual(['I am, thank you', 'A bit cold', 'Could I have a blanket?'])
    // **Nothing lands in the box by itself.** What goes there is what they
    // choose, and until then the box is theirs.
    expect(messageBox().value).toBe('')
  })

  /**
   * **Twenty at the outside, however many came back.** Twenty cells is a screen
   * somebody can read by gaze; the twenty-first is one nobody ever reaches, and
   * the ones past it push the good answers off the fold.
   */
  it('draws no more than twenty of them', async () => {
    vi.stubGlobal('fetch', suggests([...Array(30)].map((_, i) => `Answer ${i}`).join('\n')))
    withKey()

    heardAndDone('Are you comfortable')
    await act(async () => {})

    expect(answerCells()).toHaveLength(20)
    expect(answerCells()[0]).toBe('Answer 0')
  })

  /**
   * **Choosing one is what puts words in the message box**, through the
   * composer's own history — so one dwell on Undo puts back whatever was there,
   * and another answer replaces the one before it rather than piling up.
   */
  it('puts the one chosen in the message box, and replaces it with the next', async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you\nA bit cold'))
    withKey()

    heardAndDone('Are you comfortable')
    await act(async () => {})

    chooseAnswer('I am, thank you')
    expect(messageBox().value).toBe('I am, thank you')

    // **The others are still there**, which is the point of twenty of them: the
    // word at the caret is now a word of the answer they took, and narrowing to
    // it would take the rest away at the moment somebody wanted to compare them.
    expect(answerCells(), 'the other answers went away').toEqual(['I am, thank you', 'A bit cold'])

    chooseAnswer('A bit cold')
    expect(messageBox().value, 'the second was added to the first').toBe('A bit cold')
  })

  /**
   * **The board comes back afterwards, and the answers stay.** Closing the box
   * ends the question, and what they were looking at before is where they were
   * working — All is not. The answers are the most recent there are, and are
   * kept for somebody to go back to until newer ones replace them.
   */
  it('keeps the answers once the box is closed, and goes back where it was', async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you'))
    withKey()
    click($$('.filter-tab').find(t => t.textContent === 'Sorted'))

    heardAndDone('Are you comfortable')
    await act(async () => {})
    expect(answerCells()).toEqual(['I am, thank you'])

    // Closing listen mode, which is the end of that question altogether.
    click(micBtn())
    expect($('.filter-tab.active')?.textContent).toBe('Sorted')
    expect(answerTab(), 'the answers went with the box').toBeDefined()
    click(answerTab())
    expect(answerCells()).toEqual(['I am, thank you'])
  })

  // Answers being kept says nothing about anybody being asked anything, so
  // opening the box again leaves the board where it is. It goes to the answers
  // when a question goes off to be answered, and not before.
  it('does not take the board to the kept answers when the box opens again', async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you'))
    withKey()
    click($$('.filter-tab').find(t => t.textContent === 'Sorted'))
    heardAndDone('Are you comfortable')
    await act(async () => {})
    click(micBtn())

    click(micBtn())
    expect($('.filter-tab.active')?.textContent).toBe('Sorted')
  })

  // Clearing the question listens again, and the answers there were are still
  // the most recent until the next question is answered — then they are
  // replaced, whole.
  it('keeps them while the box listens again, until the next answers replace them', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(answered('I am, thank you'))
        .mockResolvedValueOnce(answered('Yes, quite warm')),
    )
    withKey()

    heardAndDone('Are you comfortable')
    await act(async () => {})
    expect(answerCells()).toEqual(['I am, thank you'])

    click(clearHeard())
    expect(answerCells(), 'listening again threw the answers away').toEqual(['I am, thank you'])

    act(() => FakeRecognition.last!.say({ transcript: 'Are you warm enough', isFinal: true }))
    act(() => FakeRecognition.last!.finish())
    settle()
    await act(async () => {})
    expect(answerCells()).toEqual(['Yes, quite warm'])
  })

  /**
   * **None of them while newer ones are being asked for.** Those seconds are the
   * one moment answers to the last question could be taken for answers to this
   * one, so the board says new ones are coming instead — and a request that
   * fails puts the last ones straight back, being still the most recent there
   * are.
   */
  it('hides them while newer ones are asked for, and puts them back if none come', async () => {
    let refuse: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(answered('I am, thank you\nA bit cold'))
        .mockImplementationOnce(
          () => new Promise((_, reject) => (refuse = () => reject(new TypeError('offline')))),
        ),
    )
    withKey()
    heardAndDone('Are you comfortable')
    await act(async () => {})

    fireEvent.change(heardBox()!, { target: { value: 'Are you warm enough' } })
    settle()
    click(suggestBtn())
    expect(answerCells(), 'answers to the last question stood in for the new ones').toEqual([])
    expect(waitingLine()).not.toBeNull()

    await act(async () => refuse())
    settle()
    expect(answerCells(), 'a failed request cost the answers there were').toEqual([
      'I am, thank you',
      'A bit cold',
    ])
    expect(waitingLine()).toBeNull()
  })

  /**
   * **A correction abandons whatever was being asked, and says so.** The result
   * still on its way is dropped, and the line promising it has to go with it —
   * left standing, it promised answers that never came and hid the ones there
   * were behind the promise.
   */
  it('stops saying answers are coming once the question they were for is corrected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(answered('I am, thank you'))
        .mockImplementationOnce(() => new Promise(() => {})),
    )
    withKey()
    heardAndDone('Are you comfortable')
    await act(async () => {})
    click(suggestBtn())
    expect(waitingLine()).not.toBeNull()

    fireEvent.change(heardBox()!, { target: { value: 'Are you comfortable there' } })
    settle()
    expect(waitingLine(), 'still promising answers to a question nobody is asking').toBeNull()
    expect(answerCells()).toEqual(['I am, thank you'])
  })

  /**
   * **Twenty cells land under a pointer that has not moved**, which is the
   * hazard every live rearrangement here guards: arming happens on arrival, so
   * the answer that appears under a resting gaze would otherwise be chosen by
   * nobody's instruction. Nothing may be chosen until the gaze moves.
   */
  it('refuses the answer that lands under a motionless pointer', async () => {
    let answer: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () => new Promise<Response>(resolve => (answer = () => resolve(answered('I am, thank you\nA bit cold')))),
      ),
    )
    withKey()

    heardAndDone('Are you comfortable')
    // The gaze wanders while the answers are on their way, and comes to rest.
    // That clears the hold the tab's own arrival took, so what is left guarding
    // the cell that lands is the answers' own — which a pointer kept still
    // through the wait would never have tested.
    fireEvent.pointerMove(document.body, { clientX: 900, clientY: 500 })
    await act(async () => answer())
    settle()

    // The browser's own doing: whatever arrives underneath gets a pointerenter.
    const landed = $$('.phrase-cell')[0]
    fireEvent.pointerEnter(landed)
    act(() => void vi.advanceTimersByTime(2000))
    expect(messageBox().value, 'an answer chose itself under a resting gaze').toBe('')

    // Aimed somewhere else, it answers as it always did.
    fireEvent.pointerMove(document.body, { clientX: 640, clientY: 400 })
    chooseAnswer('A bit cold')
    expect(messageBox().value).toBe('A bit cold')
  })

  // A correction is a question on its way to being asked, not an answer to
  // anything, so the answers there were stay until the corrected one is asked.
  it('keeps them when the question is corrected', async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you'))
    withKey()

    heardAndDone('Are you comfortable')
    await act(async () => {})

    fireEvent.change(heardBox()!, { target: { value: 'Are you comfortable in that chair' } })
    settle()
    expect(answerCells()).toEqual(['I am, thank you'])
  })

  /**
   * **The board goes with the question, as the board stands** — every phrase on
   * it, the emergency bar's included, and in the order it was written rather
   * than the order the grid shows. That order follows use, so it moves every
   * time a phrase is said: sent in it, the board would be written to the cache
   * afresh on nearly every question, and would carry how often each phrase is
   * used, which is the one record Peri keeps that goes nowhere at all.
   */
  it('sends the board with the question, the same however it has been used since', async () => {
    const fetch = suggests('I am, thank you')
    vi.stubGlobal('fetch', fetch)
    withKey()
    const boardSent = (call: number) =>
      (
        JSON.parse(String((fetch.mock.calls as unknown as [string, RequestInit][])[call][1].body)) as {
          system: { text: string; cache_control?: unknown }[]
        }
      ).system.find(b => b.cache_control)?.text ?? ''

    heardAndDone('Are you comfortable')
    await act(async () => {})
    const first = boardSent(0)
    expect(first.split('\n'), 'the user’s own phrase is not there').toContain('Apple')
    expect(first.split('\n'), 'the emergency bar is not there').toContain("I'm in pain")

    // Used, which puts it at the head of a grid in Most used order. Said rather
    // than composed, the board being in auto-speak while the microphone is
    // open — a use is counted wherever a phrase is chosen, whichever of the two
    // it then does.
    click($$('.filter-tab').find(t => t.textContent === 'Sorted'))
    click($$('.phrase-cell').find(c => c.textContent === 'Apple'))
    expect(spoken, 'the phrase was never used').toContain('Apple')

    // Emptying the question listens again, and the next one answers itself.
    click(clearHeard())
    act(() => FakeRecognition.last!.say({ transcript: 'Anything else?', isFinal: true }))
    act(() => FakeRecognition.last!.finish())
    settle()
    await act(async () => {})

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(boardSent(1), 'the board moved with the grid').toBe(first)
  })

  /**
   * Still never spoken, however it was asked for — the rule everything here is
   * arranged around. It matters more on the board than it did in the box: a
   * gaze resting on a cell is how somebody *reads* it, and with auto-speak on
   * every other cell here is said the moment it is rested on. An answer is not,
   * even the one it asked for without being asked.
   */
  it('speaks none of them, and not the one chosen either, with auto-speak on', async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you\nA bit cold'))
    withKey({ autoSpeak: true })

    heardAndDone('Are you comfortable')
    await act(async () => {})
    expect(spoken, 'a machine’s words were spoken without being chosen').toEqual([])

    chooseAnswer('I am, thank you')
    expect(spoken, 'a machine’s words were spoken by the dwell that chose them').toEqual([])
    // It waits in the box like anything else written there, and is said on
    // Speak — the same dwell every other message needs.
    expect(messageBox().value).toBe('I am, thank you')
  })

  // A suggestion never writes over words somebody already had, and that holds
  // whether they asked for it or not — the box's undo is one step, so a
  // suggestion that replaced a half-written message could not be walked back.
  it('asks for nothing while there are words in the box', async () => {
    const fetch = suggests('I am, thank you')
    vi.stubGlobal('fetch', fetch)
    withKey()
    fireEvent.change(messageBox(), { target: { value: 'half a thought' } })
    settle()

    heardAndDone('Are you comfortable')
    await act(async () => {})

    expect(fetch).not.toHaveBeenCalled()
    expect(messageBox().value).toBe('half a thought')
  })

  /**
   * A failure leaves no question, only a reason there is not one.
   *
   * **The words have to have arrived first.** A microphone refused before
   * anything was heard proves nothing about the guard — there would be no
   * question to ask about either way — so this one hears most of a sentence and
   * then loses the microphone, which is the case where half a question is
   * sitting there looking answerable.
   */
  it('asks for nothing when the listening failed part-way through', async () => {
    const fetch = suggests('I am, thank you')
    vi.stubGlobal('fetch', fetch)
    withKey()

    hear('Are you comf')
    act(() => FakeRecognition.last!.fail('not-allowed'))
    settle()
    await act(async () => {})

    expect(fetch, 'half a question was sent off to be answered').not.toHaveBeenCalled()
    expect(messageBox().value).toBe('')
  })

  /**
   * Nothing is asked for on anybody's behalf without a key of their own — the
   * same line the control follows, which is not drawn at all without one.
   *
   * **The service refusing is not the guard.** `suggestReply` reads the key
   * again and answers "no key" without going anywhere, so no request is proof of
   * very little on its own. What the guard is for is everything around the
   * request: a board with this feature switched off must not blink a waiting
   * line at somebody and then write a line under their question telling them to
   * go and set up an API account.
   */
  it('asks for nothing at all until a key is set up', async () => {
    const fetch = suggests('I am, thank you')
    vi.stubGlobal('fetch', fetch)
    renderApp({}, { key: '' })

    click(micBtn())
    act(() => void vi.advanceTimersByTime(300))
    await act(async () => {})

    expect(fetch).not.toHaveBeenCalled()
    expect(waitingLine(), 'a board with no key said answers were coming').toBeNull()
    expect(answerTab(), 'a board with no key made room for answers').toBeUndefined()
    expect($('.heard-error'), 'a board with no key was told to go and set one up').toBeNull()
  })

  /**
   * Edit mode counts as *not* empty, however little is in the draft.
   *
   * The box is showing a phrase being written there, so a reply would land in
   * the message behind it — one nobody could see, and an exchange nobody asked
   * to pay for.
   */
  it('asks for nothing while the box is showing a phrase instead', async () => {
    const fetch = suggests('I am, thank you')
    vi.stubGlobal('fetch', fetch)
    withKey()
    // Edit mode *after* the microphone, which takes the board out of it on the
    // way in — so this is somebody who opened the box and then went to change a
    // phrase, which is the only way the two are ever on together.
    click(micBtn())
    click(editToggle())
    expect(messageBox().value, 'the draft is not empty, so this proves nothing').toBe('')

    act(() => FakeRecognition.last!.say({ transcript: 'Are you comfortable', isFinal: true }))
    act(() => FakeRecognition.last!.finish())
    settle()
    await act(async () => {})

    expect(fetch).not.toHaveBeenCalled()
  })

  /**
   * The board the answers are coming to says so, where they will be — the
   * seconds between somebody being spoken to and words appearing are seconds in
   * which nothing has happened as far as they can tell.
   */
  it('says the answers are coming, on the board they are coming to', async () => {
    let answer: (body: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            answer = body =>
              resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
          }),
      ),
    )
    withKey()

    heardAndDone('Are you comfortable')
    act(() => void vi.advanceTimersByTime(300))
    expect(waitingLine()?.textContent).toMatch(/answers/i)
    expect(answerTab(), 'nowhere for the answers to land yet').toBeDefined()

    await act(async () => {
      answer({ content: [{ type: 'text', text: 'I am, thank you' }] })
    })
    settle()
    expect(waitingLine(), 'the waiting line outlived the wait').toBeNull()
    expect(answerCells()).toEqual(['I am, thank you'])
  })

  it('fills the board when the control is rested on too', async () => {
    vi.stubGlobal('fetch', suggests('Tea please\nCoffee please'))
    withKey()
    hear('Do you want tea or coffee?')

    click(suggestBtn())
    await act(async () => {})

    expect(answerCells()).toEqual(['Tea please', 'Coffee please'])
  })

  /**
   * **The rule the whole feature rests on.** A suggestion is words a machine
   * offered, and it is said only when the person dwells on Speak, like any other
   * message. Asserted with auto-speak on, which is the mode where everything
   * else on the board is spoken the moment it is chosen.
   */
  /**
   * **They are not counted as phrases used.** Those ids name something a model
   * offered a minute ago rather than anything on the board, so counting them
   * would fill the record with ids that can never match and never fall out.
   */
  it('counts none of them towards how much a phrase is used', async () => {
    vi.stubGlobal('fetch', suggests('Tea please'))
    withKey()
    hear('Do you want tea or coffee?')
    click(suggestBtn())
    await act(async () => {})

    chooseAnswer('Tea please')
    expect(JSON.parse(localStorage.getItem('peri_usage') ?? '{}')).toEqual({})
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
    chooseAnswer('Tea please')

    click($$('.icon-btn').find(b => /clear/i.test(b.getAttribute('aria-label') ?? '')))
    click($$('.icon-btn').find(b => /undo/i.test(b.getAttribute('aria-label') ?? '')))

    expect(messageBox().value).toBe('Tea please')
  })

  it('says so when the service will not answer, and leaves the box alone', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    withKey()
    click($$('.filter-tab').find(t => t.textContent === 'Sorted'))
    hear('Do you want tea?')

    click(suggestBtn())
    await act(async () => {})

    expect($('.heard-error')?.textContent).toMatch(/could not reach/i)
    expect(messageBox().value).toBe('')
    expect(answerTab(), 'a failure left a tab with nothing behind it').toBeUndefined()
    // Nothing came of asking and nothing was kept, which is the question done
    // with as surely as closing the box: the board goes back where it was
    // rather than falling through to All.
    expect($('.filter-tab.active')?.textContent).toBe('Sorted')
  })

  /**
   * **The model grid waits for Done or Cancel**, like every grid here with those
   * two on it. It closed on the first tile, with a Cancel that did what Done did.
   */
  it('marks a model on a rest and keeps it only on Done', () => {
    withKey()
    click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    click($('.reply-model-trigger'))

    const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
    const warmest = () =>
      inDoc('.picker-tile').find(t => t.querySelector('.picker-tile-name')?.textContent === 'Warmest')
    const action = (label: string) =>
      inDoc('.picker-modal-actions .panel-btn').find(b => b.getAttribute('aria-label') === label)
    const stored = () => JSON.parse(localStorage.getItem('dwellspeak_settings') ?? '{}').replyModel

    const before = stored()
    click(warmest())
    expect(inDoc('.picker-modal'), 'the first tile closed the grid').toHaveLength(1)
    expect(warmest()!.getAttribute('aria-selected')).toBe('true')
    expect(stored(), 'written before anybody said Done').toBe(before)

    click(action('Done'))
    expect(inDoc('.picker-modal')).toHaveLength(0)
    expect(stored()).toBe('claude-fable-5-1')
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
    // Drawn as a blank on the cell rather than as three underscores somebody
    // would have to say out loud.
    expect($('.phrase-cell .phrase-slot.is-blank'), 'the gap is not a blank').not.toBeNull()

    chooseAnswer('I took them at  this morning')
    act(() => void vi.advanceTimersByTime(50))
    expect(messageBox().value).toBe('I took them at  this morning')
    expect(messageBox().selectionStart).toBe(15)
  })

  /**
   * "Tea or coffee?" followed by "milk?" is one exchange. An answer to the
   * second that had never seen the first would be answering a different
   * question.
   *
   * **What goes into the record is the one they took**, rather than whichever
   * the model happened to put first. Twenty answers are not an exchange; what
   * was said is — and the old single reply was written down whether or not
   * anybody said it, so a conversation could carry on from words nobody spoke.
   */
  it('answers the next question alongside the answer that was taken', async () => {
    const fetcher = suggests('Tea please\nCoffee please')
    vi.stubGlobal('fetch', fetcher)
    withKey()

    hear('Tea or coffee?')
    click(suggestBtn())
    await act(async () => {})
    chooseAnswer('Coffee please')

    click(clearHeard())
    act(() => FakeRecognition.last!.say({ transcript: 'Milk?', isFinal: true }))
    settle()
    // The box holds the answer they took, and nothing is asked for while there
    // are words in it — a message half written says they are already answering.
    click($$('.icon-btn').find(b => /clear/i.test(b.getAttribute('aria-label') ?? '')))
    click(suggestBtn())
    await act(async () => {})

    const second = JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[1][1].body)) as {
      messages: { role: string; content: string }[]
    }
    expect(second.messages.map(m => m.content)).toEqual([
      'Someone just asked me: Tea or coffee?',
      'Coffee please',
      'Someone just asked me: Milk?',
    ])
  })

  /**
   * **An answer kept is written down against the question it answered.** A
   * request that fails leaves the last answers on the board while the box holds
   * the question that failed, and a choice among them recorded against that one
   * would put words in the conversation as the answer to something they never
   * answered.
   */
  it('writes a kept answer down against the question it answered', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(answered('Tea please\nCoffee please'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(answered('Yes please'))
    vi.stubGlobal('fetch', fetcher)
    withKey()

    hear('Tea or coffee?')
    click(suggestBtn())
    await act(async () => {})

    fireEvent.change(heardBox()!, { target: { value: 'Milk?' } })
    settle()
    click(suggestBtn())
    await act(async () => {})
    chooseAnswer('Coffee please')

    click($$('.icon-btn').find(b => /clear/i.test(b.getAttribute('aria-label') ?? '')))
    click(suggestBtn())
    await act(async () => {})

    const third = JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[2][1].body)) as {
      messages: { role: string; content: string }[]
    }
    expect(third.messages.map(m => m.content)).toEqual([
      'Someone just asked me: Tea or coffee?',
      'Coffee please',
      'Someone just asked me: Milk?',
    ])
  })

  // Nothing was said, so there is nothing to carry forward. A question answered
  // off somebody's own board leaves no machine's words behind pretending to be
  // what they replied.
  it('carries nothing forward from a question nobody answered off the board', async () => {
    const fetcher = suggests('Tea please\nCoffee please')
    vi.stubGlobal('fetch', fetcher)
    withKey()

    hear('Tea or coffee?')
    click(suggestBtn())
    await act(async () => {})

    click(clearHeard())
    act(() => FakeRecognition.last!.say({ transcript: 'Milk?', isFinal: true }))
    settle()
    click(suggestBtn())
    await act(async () => {})

    const second = JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit][])[1][1].body)) as {
      messages: { role: string; content: string }[]
    }
    expect(second.messages.map(m => m.content)).toEqual(['Someone just asked me: Milk?'])
  })

  /**
   * **A key Anthropic turns away closes the box the way a missing one does**:
   * nothing the box does will work until the key changes, so it stops
   * listening, lets go of the question, and says in the box what to check and
   * where. Setting another key lifts it, without anything having to remember to.
   */
  it('says in the box when the key is not accepted, and takes nothing until it changes', async () => {
    vi.stubGlobal('fetch', answers({ error: {} }, 401))
    withKey()
    hear('Do you want tea?')

    click(suggestBtn())
    await act(async () => {})
    settle()

    expect(heardBox()!.value).toBe(KEY_NOTICE.refused)
    expect(heardBox()!.readOnly).toBe(true)
    expect(FakeRecognition.last!.stopped, 'still listening with a key that will not work').toBe(true)
    expect($('.heard-error'), 'said twice, once in the box and once under it').toBeNull()
    fireEvent.change(heardBox()!, { target: { value: 'Tea?' } })
    settle()
    expect(heardBox()!.value).toBe(KEY_NOTICE.refused)

    // A new key, set in Settings, and the box takes questions again.
    vi.stubGlobal('fetch', answers({ data: [] }))
    openSettings()
    click(answersRow().querySelector('[aria-label="Remove"]'))
    expect(heardBox()!.value, 'no key is not a refused key').toBe(KEY_NOTICE.missing)
    typeKey('sk-ant-another')
    click(answersRow().querySelector('[aria-label="Save"]'))
    await act(async () => {})
    settle()
    expect(heardBox()!.value).toBe('')
    expect(heardBox()!.readOnly).toBe(false)
  })

  // The key taken away mid-question — in Settings here, or on another device
  // and synchronized — and the box stops where it is.
  it('stops listening and says so when the key is removed', () => {
    renderApp()
    click(micBtn())
    act(() => FakeRecognition.last!.soundStarts())
    act(() => FakeRecognition.last!.say({ transcript: 'Tea?', isFinal: false }))
    settle()

    openSettings()
    click(answersRow().querySelector('[aria-label="Remove"]'))

    expect(FakeRecognition.last!.stopped).toBe(true)
    expect(heardBox()!.value).toBe(KEY_NOTICE.missing)
    expect($('.heard-live')).toBeNull()
  })

  /**
   * **A key is saved only once Anthropic has taken it**, the way an ElevenLabs
   * key is linked — and one it could not check is not saved either, rather than
   * opening the box to a key that may never have worked.
   */
  it('saves a key only once Anthropic has taken it', async () => {
    renderApp({}, { key: '' })
    openSettings()
    typeKey('sk-ant-wrong')
    const save = async () => {
      click(answersRow().querySelector('[aria-label="Save"]'))
      await act(async () => {})
      settle()
    }

    vi.stubGlobal('fetch', answers({ error: {} }, 401))
    await save()
    expect(answersRow().querySelector('[role="alert"]')?.textContent).toMatch(/did not accept/)
    expect(localStorage.getItem('peri_reply'), 'a refused key was saved').toBeNull()

    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await save()
    expect(answersRow().querySelector('[role="alert"]')?.textContent).toMatch(/Could not reach/)
    expect(localStorage.getItem('peri_reply'), 'an unchecked key was saved').toBeNull()

    const lists = answers({ data: [] })
    vi.stubGlobal('fetch', lists)
    await save()
    expect(localStorage.getItem('peri_reply')).toBe('sk-ant-wrong')
    expect(String((lists.mock.calls[0] as unknown as [string])[0])).toContain('/v1/models')
    expect(answersRow().querySelector('[role="alert"]')).toBeNull()
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

    const cell = $$('.phrase-cell')[0]!
    click(cell)

    // Said rather than collected, the microphone having put the board in
    // auto-speak on the way in — which is the whole point of that rule: the
    // board is answering somebody.
    expect(spoken).toEqual([cell.textContent])
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

/**
 * The answers last offered, across Peri being closed and opened again.
 *
 * A board on a mounted device is reloaded by whoever charges it rather than by
 * the person using it, so answers that went with every reload went at somebody
 * else's say-so. They are kept by the day's rules instead: forgotten when the
 * day's questions are, and with them.
 */
describe('the answers last offered, across a reload', () => {
  const HOUR = 60 * 60 * 1000
  const withKey = () => {
    saveReplyKey('sk-ant-test')
    renderApp()
  }
  /** Peri closed and opened again, with whatever it wrote down still there. */
  const reopen = () => {
    cleanup()
    renderApp()
  }
  const answeredOnce = async () => {
    vi.stubGlobal('fetch', suggests('I am, thank you\nA bit cold'))
    withKey()
    heardAndDone('Are you comfortable')
    await act(async () => {})
    expect(answerCells()).toEqual(['I am, thank you', 'A bit cold'])
  }

  // Kept, and not gone to: nobody is being asked anything on arrival, and a
  // board that opened on answers would be opening on somebody else's question.
  it('keeps them across Peri being closed and opened again', async () => {
    await answeredOnce()
    reopen()

    expect($('.filter-tab.active')?.textContent).toBe('All')
    click(answerTab())
    expect(answerCells()).toEqual(['I am, thank you', 'A bit cold'])
  })

  it('writes one chosen after a reload down against the question it answered', async () => {
    await answeredOnce()
    reopen()
    click(answerTab())
    chooseAnswer('A bit cold')

    expect(loadReplyContext().map(t => [t.question, t.reply])).toEqual([['Are you comfortable', 'A bit cold']])
  })

  /**
   * **Forgotten after the day on the screen, not only in storage.** A tablet on
   * a wheelchair mount can stay open for a week, and "forgotten after a day"
   * has to be true of what somebody can see as well as of what is written down.
   */
  it('forgets them after a day, even on a board nobody reloads', async () => {
    await answeredOnce()

    act(() => void vi.advanceTimersByTime(24 * HOUR - 60_000))
    expect(answerTab(), 'gone before their day was up').toBeDefined()

    act(() => void vi.advanceTimersByTime(60_000))
    expect(answerTab(), "yesterday's answers are still on the board").toBeUndefined()
    expect(localStorage.getItem('peri_answers')).toBeNull()
  })

  // Their day is counted from when they arrived, not from the reload: a board
  // reopened an hour before the day is up still forgets them in that hour.
  it('counts their day from when they arrived, not from the reload', () => {
    saveReplyKey('sk-ant-test')
    saveAnswers({ at: Date.now() - 23 * HOUR, question: 'Are you comfortable', replies: ['I am, thank you'] })
    renderApp()
    expect(answerTab()).toBeDefined()

    act(() => void vi.advanceTimersByTime(HOUR))
    expect(answerTab(), 'a reload bought them another day').toBeUndefined()
  })

  it('brings nothing back that is a day old', () => {
    saveReplyKey('sk-ant-test')
    saveAnswers({ at: Date.now() - 25 * HOUR, question: 'Yesterday', replies: ['Long ago'] })
    renderApp()
    expect(answerTab()).toBeUndefined()
  })

  // Answers belong to the key that paid for them, and go with it.
  it('brings nothing back without a key', () => {
    saveAnswers({ at: Date.now(), question: 'Are you comfortable', replies: ['I am, thank you'] })
    renderApp({}, { key: '' })
    expect(answerTab()).toBeUndefined()
  })

  /**
   * **Forgetting the conversation forgets the answers on the board too**, now
   * rather than at the next reload — the row used to empty storage by itself,
   * which would have left twenty answers standing after it said they were gone.
   */
  it("goes with today's conversation, from the Settings row", async () => {
    await answeredOnce()
    openSettings()
    click(answersRow().querySelector('[aria-label="Forget today\'s conversation"]'))

    expect(answerTab(), 'the answers outlived the conversation they were part of').toBeUndefined()
    expect(localStorage.getItem('peri_answers')).toBeNull()
  })

  it('goes with the key', async () => {
    await answeredOnce()
    openSettings()
    click(answersRow().querySelector('[aria-label="Remove"]'))

    expect(answerTab(), 'the answers outlived the key that paid for them').toBeUndefined()
    expect(localStorage.getItem('peri_answers')).toBeNull()
  })
})
