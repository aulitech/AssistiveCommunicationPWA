// **The speaking tab** — a tab of its own showing only the last thing said, and
// playing it, so that it and nothing else can be shared into a video call. See
// [Speaking into a call](docs/decisions/speaking-into-a-call.md).
//
// Both ends of it are here, Peri's and the tab's, so the conversation between
// them can be read in one place. They talk over a `BroadcastChannel`, which
// reaches the other tabs of this site in this browser and nothing else: nothing
// said goes through a server to get from one tab to the other.
//
// **Why the tab has to play the clip itself.** A call is sent a shared tab's
// sound as a stream of its own, which is the one route into a call that echo
// cancellation leaves alone — the microphone hearing the speakers is exactly
// what it exists to remove. But only sound the tab itself plays is in that
// stream. So when the tab is open, Peri hands it the clip and stays quiet, or
// the person would hear everything twice.
//
// **A device voice cannot go this way**, and the tab only shows its words. The
// synthesiser is played by the operating system rather than by any tab — Chrome
// captures none of it, the Mac's own voices or its own Google ones, which was
// measured rather than assumed.

/** What the two ends say to each other. */
export type SpeakingMessage =
  /** Peri: this was just said — and, for a clip, play it. */
  | { kind: 'said'; id: number; text: string; clip?: Blob; volume?: number; rate?: number }
  /** Peri: stop playing. Something else is being said, or nothing is. */
  | { kind: 'hush' }
  /** Peri, arriving: is a speaking tab open? */
  | { kind: 'who' }
  /** The tab: open, and listening. Said on arriving and in answer to `who`. */
  | { kind: 'here' }
  /** The tab: closing, or being put to sleep by the browser. */
  | { kind: 'gone' }
  /** The tab: the clip is playing. */
  | { kind: 'playing'; id: number }
  /** The tab: the browser would not let it play the clip. */
  | { kind: 'refused'; id: number }

const CHANNEL = 'peri-speaking'

/** Where the tab is served. */
export const SPEAKING_PATH = '/speaking'

/** The name the tab is opened under, so opening it again finds the one already open. */
export const SPEAKING_WINDOW = 'peri-speaking'

/**
 * **How long Peri waits to hear that the tab is playing** before playing the
 * clip itself. A tab that is there answers in a few milliseconds; this is for
 * one the browser discarded without its saying so. It is the one wait in front
 * of a clip, the emergency bar's included, and it is bounded rather than
 * silent: **a phrase never fails into silence**, and a clip handed to a tab
 * that has gone would be one.
 */
export const ANSWER_MS = 500

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
}

// ── Peri's end ──

let channel: BroadcastChannel | null | undefined
/** Whether a speaking tab has said it is here, and not since that it has gone. */
let tabOpen = false
let nextId = 1
const awaiting = new Map<number, { timer: ReturnType<typeof setTimeout>; playHere: () => void }>()

function settle(id: number, played: boolean) {
  const waiting = awaiting.get(id)
  if (!waiting) return
  awaiting.delete(id)
  clearTimeout(waiting.timer)
  if (!played) waiting.playHere()
}

/**
 * Peri's end of the channel, opened the first time it is asked for — and asked
 * for as speech loads, so a tab opened before anything is said is known about
 * before anything is said. `null` in a browser without the API, where every
 * call below does nothing and Peri plays everything itself, as it always did.
 */
export function speakingChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  channel = openChannel()
  if (!channel) return null
  channel.onmessage = (e: MessageEvent<SpeakingMessage>) => {
    const message = e.data
    if (message.kind === 'here') tabOpen = true
    else if (message.kind === 'gone') tabOpen = false
    else if (message.kind === 'playing') settle(message.id, true)
    else if (message.kind === 'refused') settle(message.id, false)
  }
  channel.postMessage({ kind: 'who' } satisfies SpeakingMessage)
  return channel
}

/** Whether there is a speaking tab to hand a clip to. */
export function speakingTabOpen(): boolean {
  return speakingChannel() !== null && tabOpen
}

/** Tells the tab what was said, where the sound is Peri's own — a device voice. */
export function showSaid(text: string) {
  speakingChannel()?.postMessage({ kind: 'said', id: nextId++, text } satisfies SpeakingMessage)
}

/**
 * Hands the tab a clip to play, with the words to show. `playHere` is called
 * if it will not — the browser refused it, or it did not answer in time — and
 * a tab that did not answer is taken to have gone, so the next clip is not
 * kept waiting for it too.
 */
export function handToSpeakingTab(
  said: { text: string; clip: Blob; volume: number; rate: number },
  playHere: () => void,
) {
  const out = speakingChannel()
  if (!out) return playHere()
  const id = nextId++
  const timer = setTimeout(() => {
    tabOpen = false
    settle(id, false)
  }, ANSWER_MS)
  awaiting.set(id, { timer, playHere })
  out.postMessage({ kind: 'said', id, ...said } satisfies SpeakingMessage)
}

/** Stops whatever the tab is playing. Every new utterance starts with this, as it does here. */
export function hushSpeakingTab() {
  // Anything still waiting on an answer belongs to what is being stopped.
  for (const { timer } of awaiting.values()) clearTimeout(timer)
  awaiting.clear()
  if (tabOpen) channel?.postMessage({ kind: 'hush' } satisfies SpeakingMessage)
}

// ── The tab's end ──

/**
 * The tab's end of the channel. `show` is given every message said; `play` a
 * clip, resolving once it is playing and rejecting if the browser will not.
 * Returns the way to close it.
 */
export function serveSpeaking(handlers: {
  show: (text: string) => void
  play: (clip: Blob, volume: number, rate: number) => Promise<void>
  hush: () => void
}): () => void {
  const tab = openChannel()
  if (!tab) return () => {}
  const send = (message: SpeakingMessage) => tab.postMessage(message)

  tab.onmessage = (e: MessageEvent<SpeakingMessage>) => {
    const message = e.data
    if (message.kind === 'who') send({ kind: 'here' })
    else if (message.kind === 'hush') handlers.hush()
    else if (message.kind === 'said') {
      handlers.show(message.text)
      const { id, clip } = message
      if (clip)
        handlers.play(clip, message.volume ?? 1, message.rate ?? 1).then(
          () => send({ kind: 'playing', id }),
          () => send({ kind: 'refused', id }),
        )
    }
  }

  // **Gone while asleep as well as when closed.** A browser freezes a tab it
  // has not been shown for a while, and a frozen tab is one that cannot answer;
  // saying so before it sleeps saves every clip a half-second wait.
  const here = () => send({ kind: 'here' })
  const gone = () => send({ kind: 'gone' })
  const onShow = (e: PageTransitionEvent) => e.persisted && here()
  window.addEventListener('pagehide', gone)
  window.addEventListener('pageshow', onShow)
  document.addEventListener('freeze', gone)
  document.addEventListener('resume', here)
  here()

  return () => {
    gone()
    window.removeEventListener('pagehide', gone)
    window.removeEventListener('pageshow', onShow)
    document.removeEventListener('freeze', gone)
    document.removeEventListener('resume', here)
    tab.close()
  }
}
