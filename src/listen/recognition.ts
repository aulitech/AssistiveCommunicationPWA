// The microphone, and the words it hears.
//
// Peri has always been one-directional: somebody says something, and the other
// half of the conversation is a person talking into the room with no trace of it
// on the board. Listen mode is that half — the question is heard, written down,
// and can then be read, corrected and translated like anything else here.
//
// **This is the browser's ear, not ours.** `SpeechRecognition` is a platform API
// and what it does with the audio is the platform's business: most browsers send
// it to a speech service of their own rather than recognising it on the device.
// That is a disclosure rather than a detail, and it is written in the three
// places this app writes such things — see the guide and the privacy policy.
//
// **Nothing throws**, the rule every outward-facing module here follows. A
// browser without the API, a refused microphone, a recogniser that gives up
// halfway: all of them are a value the caller can show, and the board carries on
// exactly as it always has.

import { reportFailure } from '../core/report'
import { speechTag } from '../core/translation'

/**
 * The two names this API goes by.
 *
 * It has been prefixed in every shipping browser for a decade and is only now
 * arriving unprefixed, so both have to be asked for — and neither is in the DOM
 * types, which is why this is the one `any` in the module.
 */
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onaudiostart: (() => void) | null
  onaudioend: (() => void) | null
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type RecognitionClass = new () => RecognitionLike

const recognitionClass = (): RecognitionClass | null => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Whether this browser can listen at all.
 *
 * Asked before the control is drawn rather than after it is dwelled: a button
 * that does nothing is worse than no button, and on a board aimed at by gaze it
 * is a target spent for nothing.
 */
export const canListen = (): boolean => recognitionClass() !== null

/** What a listening session hands back as it goes. */
export interface Listening {
  /** Everything settled so far, plus whatever is still being guessed at. */
  onHeard: (text: string, final: boolean) => void
  /** Told once, whether it stopped on its own, was stopped, or failed. */
  onDone: (error?: string) => void
  /**
   * Told when sound starts coming in, and when it stops.
   *
   * **Not the same moment as being asked to listen.** The browser asks for
   * permission first, and may take a moment to open the device after that — so
   * what says the microphone is live has to wait for this rather than for the
   * request, or it says so while nothing is being heard at all.
   */
  onSound?: (on: boolean) => void
}

/** Why listening ended, in words somebody can act on. */
function describe(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'The microphone was refused — allow it for Peri in your browser'
  }
  if (error === 'no-speech') return 'Nothing was heard'
  if (error === 'audio-capture') return 'No microphone was found'
  if (error === 'network') return 'Could not reach the speech service'
  if (error === 'aborted') return ''
  return 'The microphone stopped'
}

/**
 * Start listening, and hand back the way to stop.
 *
 * **The tag is the one the synthesiser would be told**, not the one the setting
 * holds — `speechTag` again. There is no Patois recogniser any more than there
 * is a Patois voice, so Patois is listened for as Jamaican English, and a board
 * set to it hears something rather than nothing.
 *
 * Interim results are on, because a gaze user needs to see that the thing is
 * working: a box that stays empty for four seconds and then fills is
 * indistinguishable from a box that is broken.
 */
export function listen(tag: string, { onHeard, onDone, onSound }: Listening): () => void {
  let recognition: RecognitionLike
  try {
    // A browser with neither name reaches this as a `new null()`, which is the
    // same failure as a browser that has the name and refuses to make one — so
    // both go through one catch rather than through a guard and a catch that
    // would have to be kept saying the same thing.
    recognition = new (recognitionClass() as RecognitionClass)()
  } catch {
    onDone('This browser cannot listen')
    return () => {}
  }

  // An empty tag is what the API itself means by "the device decides", so it is
  // set either way rather than guarded — `speechTag('')` is `''`.
  recognition.lang = speechTag(tag)
  // A question is a sentence or two, and a recogniser left to decide for itself
  // stops at the first pause — which in a room is somebody drawing breath.
  recognition.continuous = true
  recognition.interimResults = true

  let done = false
  const finish = (error?: string) => {
    if (done) return
    done = true
    if (error) reportFailure('listen', error)
    onDone(error)
  }

  recognition.onresult = event => {
    let settled = ''
    let guessing = ''
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      const said = result[0]?.transcript ?? ''
      if (result.isFinal) settled += said
      else guessing += said
    }
    onHeard((settled + guessing).trim(), guessing === '')
  }

  recognition.onerror = event => {
    const said = describe(event.error ?? '')
    // An abort is this app stopping it on purpose, which is not a failure and
    // has nothing to say.
    finish(said || undefined)
  }

  recognition.onend = () => finish()
  recognition.onaudiostart = () => {
    if (!done) onSound?.(true)
  }
  recognition.onaudioend = () => onSound?.(false)

  try {
    recognition.start()
  } catch {
    // Already running, in the main case. Starting twice is the caller's bug
    // rather than the user's problem, so it ends quietly.
    finish()
    return () => {}
  }

  return () => {
    if (done) return
    try {
      recognition.stop()
    } catch {
      finish()
    }
  }
}
