// Speech output. One entry point so every utterance — composed message,
// emergency phrase, preview — honours the user's voice, volume and rate.
//
// Two sources sit behind it. The device's own synthesiser is instant, free and
// works with no network. A linked ElevenLabs account sounds better and does
// none of those things. Everything below is arranged so that the second one
// failing is never heard as silence: any path that cannot produce audio ends in
// the device saying the words instead.

import { stripMarkdown } from '../core/markdown'
import { loadElevenLabs, type ElevenLabsAccount } from '../core/store'
import { remoteVoiceId, synthesize } from './elevenlabs'
import { audioKey, cachedAudio } from './audio-cache'

export interface VoiceSettings {
  voiceURI: string // empty = browser default
  /** BCP-47, or empty to leave the device to decide. */
  language?: string
  volume: number // 0–1
  rate: number // 0.5–2
}

export interface SpeakOptions {
  /** This phrase's own voice, overriding the one in settings. */
  voiceURI?: string
  /**
   * Never wait on the network. The emergency bar sets this: those phrases have
   * to be instant and have to work with the connection down.
   *
   * It does not mean "device voice" — a phrase given its own voice keeps it here
   * too, provided the audio is already in hand. What it rules out is going and
   * asking for it, which is the part an emergency cannot afford.
   */
  instant?: boolean
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
  // A voice is a stronger statement than a language, so it wins — but a
  // `voiceURI` is a platform string, and one that travelled here from another
  // device may name nothing at all. This is what stops that falling all the way
  // back to whatever the *system* speaks.
  if (!utterance.voice && settings.language) utterance.lang = settings.language
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

export function speak(source: string, settings: VoiceSettings, options: SpeakOptions = {}) {
  // Markup is taken off here, once, rather than at each of the places that ask
  // for speech. A phrase can carry markdown and the message box keeps it, so
  // every route into this function can arrive with asterisks in hand — and an
  // app that says "asterisk asterisk help" out loud has failed at its only job.
  // Doing it here also means the cache is keyed by the words, so `**Help**` and
  // `Help` are the same clip rather than two.
  const text = stripMarkdown(source)
  if (!text.trim()) return
  stopEverything()

  // A phrase's own voice wins over the one in settings. Both are `voiceURI`s, so
  // everything downstream — the fallback, the device lookup — is unchanged.
  const chosen = { ...settings, voiceURI: options.voiceURI || settings.voiceURI }
  const linked = currentAccount()
  const voiceId = remoteVoiceId(chosen.voiceURI)
  const mine = generation
  const fallBack = () => {
    if (mine === generation) speakOnDevice(text, chosen)
  }

  if (!voiceId || !linked) {
    speakOnDevice(text, chosen)
    return
  }

  // Already fetched: play it now, whoever is asking.
  const inHand = cachedAudio(audioKey(voiceId, text))
  if (inHand) {
    playAudio(inHand, chosen, fallBack)
    return
  }

  // Not in hand, and this is a phrase that cannot wait. The device says it now
  // rather than the right voice saying it in a second and a half.
  if (options.instant) {
    speakOnDevice(text, chosen)
    return
  }

  synthesize(linked, voiceId, text)
    .then(blob => {
      if (mine !== generation) return
      playAudio(blob, chosen, fallBack)
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

/**
 * Fetches and stores a phrase's audio for the voice it has just been given, so
 * that saying it costs no wait — including on the emergency bar, which will not
 * wait. Failing is fine and silent: the phrase falls back like any other.
 */
export async function warmVoice(source: string, voiceURI: string): Promise<boolean> {
  // Stripped the same way `speak` strips it, or the clip would be stored under
  // the marked-up text and never found again by the phrase that asked for it.
  const text = stripMarkdown(source)
  const voiceId = remoteVoiceId(voiceURI)
  const linked = currentAccount()
  if (!voiceId || !linked || !text.trim()) return false
  try {
    await synthesize(linked, voiceId, text)
    return true
  } catch {
    return false
  }
}
