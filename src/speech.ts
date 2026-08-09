// Speech output. One entry point so every utterance — composed message,
// emergency phrase, preview — honours the user's voice, volume and rate.
//
// Two sources sit behind it. The device's own synthesiser is instant, free and
// works with no network. A linked ElevenLabs account sounds better and does
// none of those things. Everything below is arranged so that the second one
// failing is never heard as silence: any path that cannot produce audio ends in
// the device saying the words instead.

import { loadElevenLabs } from './store'
import { remoteVoiceId, synthesize, type ElevenLabsAccount } from './elevenlabs'

export interface VoiceSettings {
  voiceURI: string // empty = browser default
  volume: number // 0–1
  rate: number // 0.5–2
}

export interface SpeakOptions {
  /**
   * Use the device voice whatever is chosen. The emergency bar sets this: those
   * phrases have to be instant and have to work with the network down, and a
   * request that has to come back first is neither.
   */
  local?: boolean
}

// Read per utterance rather than mirrored in a variable here. A JSON parse of
// a small object costs nothing next to speaking, and it means there is no second
// copy to keep in step — linking, unlinking and a second tab all take effect on
// the very next thing said.
const currentAccount = (): ElevenLabsAccount | null => {
  try {
    return loadElevenLabs()
  } catch {
    return null
  }
}

// Bumped by every new utterance. A fetch that comes back after the user has
// asked for something else belongs to a message they have moved on from, so it
// is dropped rather than spoken over the top.
let generation = 0
let playing: HTMLAudioElement | null = null

function stopEverything() {
  generation++
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  if (playing) {
    playing.pause()
    playing = null
  }
}

function speakOnDevice(text: string, settings: VoiceSettings) {
  if (!('speechSynthesis' in window)) return

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.volume = settings.volume
  utterance.rate = settings.rate
  if (settings.voiceURI) {
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
  }
  speechSynthesis.speak(utterance)
}

function playAudio(blob: Blob, settings: VoiceSettings, onFailure: () => void) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.volume = settings.volume
  // ElevenLabs has no rate of its own to ask for, and the speed control has to
  // keep meaning something whichever voice is chosen.
  audio.playbackRate = settings.rate
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
  playing = audio
  // A browser that refuses to play without a recent click is one more way of
  // ending up silent, so it is treated like any other failure.
  audio.play()?.catch?.(() => {
    URL.revokeObjectURL(url)
    onFailure()
  })
}

export function speak(text: string, settings: VoiceSettings, options: SpeakOptions = {}) {
  if (!text.trim()) return
  stopEverything()

  const linked = currentAccount()
  const voiceId = options.local ? null : remoteVoiceId(settings.voiceURI)
  if (!voiceId || !linked) {
    speakOnDevice(text, settings)
    return
  }

  const mine = generation
  const fallBack = () => {
    if (mine === generation) speakOnDevice(text, settings)
  }

  synthesize(linked, voiceId, text)
    .then(blob => {
      if (mine !== generation) return
      playAudio(blob, settings, fallBack)
    })
    .catch(fallBack)
}

/**
 * Voices load asynchronously in most browsers and the `voiceschanged` event can
 * fire more than once. Subscribe and re-read rather than snapshotting on mount.
 */
export function subscribeVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (!('speechSynthesis' in window)) {
    onChange([])
    return () => {}
  }

  const read = () => {
    // Group by language so a long list stays navigable, with the UI language first.
    const preferred = navigator.language.toLowerCase()
    const voices = [...speechSynthesis.getVoices()].sort((a, b) => {
      const aPref = a.lang.toLowerCase().startsWith(preferred.slice(0, 2)) ? 0 : 1
      const bPref = b.lang.toLowerCase().startsWith(preferred.slice(0, 2)) ? 0 : 1
      return aPref - bPref || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)
    })
    onChange(voices)
  }

  read()
  speechSynthesis.addEventListener('voiceschanged', read)
  return () => speechSynthesis.removeEventListener('voiceschanged', read)
}
