// Platform APIs the app relies on that jsdom does not implement.

import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { clearAudioCache } from '../src/voice/audio-cache'
import { forgetPointerStream, releaseDwells } from '../src/ui/dwell'

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
export const downloads: { filename: string; text: string }[] = []

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
export let clipboardText = ''
export const setClipboardText = (text: string) => {
  clipboardText = text
}

// Reading a Blob back is asynchronous and a download is not, so remember what
// went into one on the way in.
const contents = new WeakMap<Blob, string>()
const blobText = new Map<string, string>()
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
  // Module state: one test going deaf must not leave the next one unable to
  // dwell at all. See `holdDwells`.
  releaseDwells()
  forgetPointerStream()
  warnings.length = 0
  localStorage.clear()

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
  // jsdom has no object URLs and no downloads. Recording what a download would
  // have carried is the only way to assert on the file the app hands out.
  vi.stubGlobal('Blob', RecordingBlob)
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = () => {}
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (this.download) downloads.push({ filename: this.download, text: blobText.get(this.href) ?? '' })
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
