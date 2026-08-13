// Platform APIs the app relies on that jsdom does not implement.

import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { clearAudioCache } from '../voice/audio-cache'

/** Everything spoken during a test, in order. */
export const spoken: string[] = []

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
  localStorage.clear()

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
  vi.stubGlobal('scrollTo', () => {})

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}), readText: vi.fn(async () => clipboardText) },
    configurable: true,
  })

  clipboardText = ''
  audioPlays = true
  played.length = 0
  downloads.length = 0
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
})
