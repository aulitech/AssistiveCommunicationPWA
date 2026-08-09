// Platform APIs the app relies on that jsdom does not implement.

import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
