// A stand-in for `SpeechRecognition`, which jsdom has no notion of.
//
// It implements only what `listen/recognition.ts` touches, and it is driven by
// the test rather than by a microphone: `say` delivers words, `finish` ends the
// session, `fail` ends it the way a refused microphone does.

interface Result {
  transcript: string
  isFinal: boolean
}

export class FakeRecognition {
  static last: FakeRecognition | null = null
  /** How many have been made, so a test can prove a second was not started. */
  static made = 0
  /** Made to throw on construction, for the browser that has the name and not the thing. */
  static refuseToStart = false

  lang = ''
  continuous = false
  interimResults = false
  started = false
  stopped = false

  onresult: ((event: { resultIndex: number; results: unknown }) => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onaudioend: (() => void) | null = null

  constructor() {
    FakeRecognition.last = this
    FakeRecognition.made++
  }

  start() {
    if (FakeRecognition.refuseToStart) throw new Error('already running')
    this.started = true
  }

  stop() {
    this.stopped = true
    this.onend?.()
  }

  abort() {
    this.stopped = true
  }

  /** Delivers what has been heard so far, as the browser shapes it. */
  say(...results: Result[]) {
    const list = results.map(r => Object.assign([{ transcript: r.transcript }], { isFinal: r.isFinal }))
    this.onresult?.({ resultIndex: 0, results: Object.assign(list, { length: list.length }) })
  }

  /** The browser has the microphone open and sound is coming in — after permission, not before. */
  soundStarts() {
    this.onaudiostart?.()
  }

  /** Sound has stopped coming in, which happens before the session itself ends. */
  soundEnds() {
    this.onaudioend?.()
  }

  /** Ends the session the way a recogniser that heard the end of a sentence does. */
  finish() {
    this.onend?.()
  }

  /** Ends it the way a refusal does. */
  fail(error: string) {
    this.onerror?.({ error })
  }
}

/** Installs the fake under both names the API goes by. Call from `beforeEach`. */
export function installRecognition() {
  FakeRecognition.last = null
  FakeRecognition.made = 0
  FakeRecognition.refuseToStart = false
  ;(globalThis as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
}

/** Puts back the browser that cannot listen, which is what every other test runs in. */
export function removeRecognition() {
  FakeRecognition.last = null
  const g = globalThis as unknown as Record<string, unknown>
  delete g.SpeechRecognition
  delete g.webkitSpeechRecognition
}

/** The older, prefixed name, which is the only one most browsers have. */
export function installPrefixedRecognition() {
  removeRecognition()
  FakeRecognition.made = 0
  ;(globalThis as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
}
