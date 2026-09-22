// Platform APIs the app relies on that jsdom does not implement.

import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { clearAudioCache, setRemoteClips } from '../src/voice/audio-cache'
import { forgetPointerStream, releaseDwells } from '../src/ui/dwell'
import { forgetWhoseBoard } from '../src/core/store'

/** Everything spoken during a test, in order. */
export const spoken: string[] = []

/**
 * Every failure Peri has reported to the console, in order.
 *
 * Peri's own warnings are captured rather than printed — nearly a thousand
 * tests drive these failure paths deliberately, and a console full of expected
 * warnings is a console nobody reads. **Everything else is passed through**, so
 * React's warnings still reach the terminal, which is the whole point of
 * having them.
 */
export const warnings: string[] = []

/** The last utterance handed to the synthesiser, for asserting on voice/rate/volume. */
export let lastUtterance: SpeechSynthesisUtterance | null = null

class FakeUtterance {
  text: string
  volume = 1
  rate = 1
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  constructor(text: string) {
    this.text = text
  }
}

export const voices: SpeechSynthesisVoice[] = []

/** Files the app has offered to download, in order. */
export const downloads: { filename: string; text: string; blob?: Blob }[] = []

/** Audio the app has started playing, in order. */
export const played: { volume: number; rate: number }[] = []

/** Elements asked to bring themselves into view, newest last. jsdom has no layout
 *  and so no `scrollIntoView` at all — without this it is a missing function
 *  rather than one that does nothing. */
export const scrolledIntoView: Element[] = []

/** Set false to make playback fail the way a browser blocking autoplay does. */
export let audioPlays = true
export const setAudioPlays = (ok: boolean) => {
  audioPlays = ok
}

/** What `navigator.clipboard.readText()` will hand back. */
/**
 * **The layout jsdom will not do, for the phrase grid and nothing else.**
 *
 * `core/virtual.ts` renders every cell in the table where it cannot measure a
 * viewport, which is the right answer in a browser that has not laid out and
 * was the answer here for every test: two and a half thousand cells mounted for
 * each one, half a second each, and most of the suite's running time.
 *
 * So the grid is given a viewport — four columns of 80px rows in 400px of
 * height, which windows it to about eighty cells. It is keyed on the grid's own
 * classes rather than applied to every element, because what jsdom reports
 * about everything else is load-bearing: the message box grows by what it can
 * measure and must find nothing, and the tests that supply geometry of their
 * own supply exactly what they mean to.
 */
const GRID_VIEWPORT = { columns: 4, rowHeight: 80, clientHeight: 400 }
let gridIsLaidOut = true

/** For the tests about what the grid does with nothing to measure. */
export const unmeasuredGrid = () => {
  gridIsLaidOut = false
}

const has = (node: unknown, className: string) => node instanceof Element && node.classList.contains(className)

/**
 * jsdom's own, taken once as this file loads. A test that supplies geometry of
 * its own puts these back by deleting what it defined — and one of them deletes
 * the property outright — so what is reinstalled before each test has to come
 * from here rather than from whatever is on the prototype by then.
 */
const JSDOM_GEOMETRY = {
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!,
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')!,
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!,
}

const jsdomAnswer = (of: keyof typeof JSDOM_GEOMETRY, node: unknown) =>
  JSDOM_GEOMETRY[of].get?.call(node) as number

function installGridViewport() {
  gridIsLaidOut = true

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (!gridIsLaidOut || !has(this, 'phrase-cell')) return jsdomAnswer('offsetHeight', this)
      return GRID_VIEWPORT.rowHeight
    },
  })

  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (!gridIsLaidOut || !has(this, 'grid-wrapper')) return jsdomAnswer('clientHeight', this)
      return GRID_VIEWPORT.clientHeight
    },
  })

  // As tall as what is in it, so that `needsMore` keeps its meaning: a window
  // too short for the viewport asks for more, and stops once it is scrollable.
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (!gridIsLaidOut || !has(this, 'grid-wrapper')) return jsdomAnswer('scrollHeight', this)
      const cells = (this as Element).querySelectorAll('.phrase-cell').length
      return Math.ceil(cells / GRID_VIEWPORT.columns) * GRID_VIEWPORT.rowHeight
    },
  })

  // Only the grid's own columns, and only that one property: everything else a
  // test asks the browser about its styles is the browser's own answer.
  const realComputedStyle = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', (node: Element, pseudo?: string | null) => {
    const style = realComputedStyle(node, pseudo)
    if (!gridIsLaidOut || !has(node, 'phrase-grid')) return style
    return new Proxy(style, {
      get: (target, property) => {
        if (property === 'gridTemplateColumns') return '1fr '.repeat(GRID_VIEWPORT.columns).trim()
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? (value as () => void).bind(target) : value
      },
    })
  })
}

export let clipboardText = ''
export const setClipboardText = (text: string) => {
  clipboardText = text
}

// Reading a Blob back is asynchronous and a download is not, so remember what
// went into one on the way in.
const contents = new WeakMap<Blob, string>()
const blobText = new Map<string, string>()
/** The blob itself too, for a file that is bytes rather than text — a workbook. */
const blobs = new Map<string, Blob>()
let blobCount = 0

class RecordingBlob extends Blob {
  constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
    super(parts, options)
    contents.set(this, parts.map(String).join(''))
  }
}

function createObjectURL(blob: Blob) {
  const url = `blob:peri/${blobCount++}`
  blobText.set(url, contents.get(blob) ?? '')
  blobs.set(url, blob)
  return url
}

function installSpeechSynthesis() {
  const synth = {
    getVoices: () => voices,
    speak: (u: SpeechSynthesisUtterance) => {
      lastUtterance = u
      spoken.push(u.text)
    },
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
}

beforeEach(() => {
  spoken.length = 0
  lastUtterance = null
  // Mutable and shared, like the rest of these: a test that seeds voices must
  // not leave them for the next one. The audio cache is the same — a clip
  // fetched by one test would answer the next one's request without a fetch.
  voices.length = 0
  clearAudioCache()
  // Module state, like the dwell guards: a test that installs the other
  // devices must not leave the next one talking to them.
  setRemoteClips(null)
  // Module state: one test going deaf must not leave the next one unable to
  // dwell at all. See `holdDwells`.
  releaseDwells()
  forgetPointerStream()
  warnings.length = 0
  localStorage.clear()
  // Module state, and the first thing any storage is read through: a test that
  // opened a second account's board must not leave the next one reading it.
  forgetWhoseBoard()

  // **Tests run with no translation key unless one is stubbed in.** Vitest
  // loads `.env.local`, so without this a machine that has a real key runs
  // different tests from CI — and the ones that matter most here are about what
  // happens when there is no key: the words go out in the same tick rather than
  // a promise later. Cleared rather than trusted, and put back by the handful of
  // tests that are about having one.
  vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')

  const realWarn = console.warn.bind(console)
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.startsWith('[Peri]')) {
      warnings.push(first)
      return
    }
    realWarn(...args)
  })

  installSpeechSynthesis()
  installGridViewport()

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )

  // jsdom implements neither smooth scrolling nor the clipboard.
  Element.prototype.scrollTo = () => {}
  Element.prototype.scrollBy = () => {}
  Element.prototype.scrollIntoView = function () {
    scrolledIntoView.push(this)
  }
  vi.stubGlobal('scrollTo', () => {})

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}), readText: vi.fn(async () => clipboardText) },
    configurable: true,
  })

  clipboardText = ''
  audioPlays = true
  played.length = 0
  downloads.length = 0
  scrolledIntoView.length = 0
  blobText.clear()
  blobs.clear()
  // jsdom has no object URLs and no downloads. Recording what a download would
  // have carried is the only way to assert on the file the app hands out.
  vi.stubGlobal('Blob', RecordingBlob)
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = () => {}
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (this.download)
      downloads.push({ filename: this.download, text: blobText.get(this.href) ?? '', blob: blobs.get(this.href) })
  }

  // jsdom has the element but none of the playback behind it.
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    if (!audioPlays) return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    played.push({ volume: this.volume, rate: this.playbackRate })
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
