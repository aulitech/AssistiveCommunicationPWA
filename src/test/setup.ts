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
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
