import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { speak } from '../../src/voice/speech'
import { remoteVoiceURI } from '../../src/voice/elevenlabs'
import { audioKey, clearAudioCache, rememberAudio } from '../../src/voice/audio-cache'
import { saveElevenLabs } from '../../src/core/store'
import { forgetTranslations, seedTranslations } from '../../src/core/translation'
import {
  ANSWER_MS,
  serveSpeaking,
  speakingChannel,
  speakingTabOpen,
  type SpeakingMessage,
} from '../../src/voice/relay'
import { played, spoken } from '../setup'

// **The speaking tab**: the last thing said, shown and played in a tab of its
// own, so that tab and not the board is what goes into a call. Mostly about the
// rule everything else in speech is held to — **a phrase never fails into
// silence** — since a clip handed to a tab is a clip Peri does not play itself.

const DEVICE = { voiceURI: '', volume: 0.5, rate: 1.5 }
const REMOTE = { ...DEVICE, voiceURI: remoteVoiceURI('v1') }

/** A clip in hand for these words, so speaking them asks the network for nothing. */
function inHand(text: string) {
  saveElevenLabs({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] })
  rememberAudio(audioKey('v1', text), new Blob(['audio']))
}

/** The channel delivers a microtask later, and an answer is a second delivery after that. */
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

/** A speaking tab, as the page opens one. */
function openTab({ plays = true } = {}) {
  const shown: string[] = []
  const clips: { volume: number; rate: number }[] = []
  let hushed = 0
  const close = serveSpeaking({
    show: text => shown.push(text),
    play: async (_clip, volume, rate) => {
      if (!plays) throw new DOMException('blocked', 'NotAllowedError')
      clips.push({ volume, rate })
    },
    hush: () => hushed++,
  })
  return { shown, clips, hushed: () => hushed, close }
}

let tab: ReturnType<typeof openTab> | null = null
const open = async (options?: { plays?: boolean }) => {
  tab = openTab(options)
  await flush()
  return tab
}

beforeEach(() => {
  clearAudioCache()
  forgetTranslations()
})
afterEach(async () => {
  tab?.close()
  tab = null
  await flush()
  vi.useRealTimers()
})

// First in the file, because it is about the moment Peri's end opens: a tab
// already open by then is asked for, rather than waited for.
it('finds a tab that was open before it was listening', async () => {
  tab = openTab()
  await flush()
  speakingChannel()
  await flush()
  expect(speakingTabOpen(), 'nothing was listening when the tab said it was here').toBe(true)
})

it('knows when the tab closes, or the browser puts it to sleep', async () => {
  speakingChannel()
  const t = await open()
  expect(speakingTabOpen()).toBe(true)

  document.dispatchEvent(new Event('freeze'))
  await flush()
  expect(speakingTabOpen()).toBe(false)
  document.dispatchEvent(new Event('resume'))
  await flush()
  expect(speakingTabOpen()).toBe(true)

  t.close()
  tab = null
  await flush()
  expect(speakingTabOpen()).toBe(false)
})

describe('with a device voice', () => {
  it('shows the words in the tab and says them here', async () => {
    const t = await open()
    speak('**Hello** there', DEVICE)
    await flush()

    expect(t.shown).toEqual(['Hello there'])
    expect(t.clips).toEqual([])
    expect(spoken).toEqual(['Hello there'])
  })

  // What the call reads is what was said, which in another language is the translation.
  it('shows the words as they were said', async () => {
    const t = await open()
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })
    speak('Help me!', { ...DEVICE, language: 'fr' })
    await flush()

    expect(t.shown).toEqual(['Aidez-moi !'])
  })
})

describe('with an ElevenLabs voice', () => {
  it('hands the clip to the tab, and does not play it here as well', async () => {
    const t = await open()
    inHand('Hello')
    speak('Hello', REMOTE)
    await flush()

    expect(t.shown).toEqual(['Hello'])
    expect(t.clips).toEqual([{ volume: 0.5, rate: 1.5 }])
    expect(played, 'played twice — once here and once in the tab').toEqual([])
    expect(spoken).toEqual([])
  })

  it('plays it here with no tab open', async () => {
    speakingChannel()
    inHand('Hello')
    speak('Hello', REMOTE)
    await flush()

    expect(played).toHaveLength(1)
  })

  it('plays it here when the tab may not', async () => {
    const t = await open({ plays: false })
    inHand('Hello')
    speak('Hello', REMOTE)
    await flush()

    expect(t.clips).toEqual([])
    expect(played, 'the clip went unsaid').toHaveLength(1)
  })

  // A tab the browser discarded says nothing at all. Bounded, not silent.
  it('plays it here when the tab does not answer, and stops waiting on it', async () => {
    vi.useFakeTimers()
    speakingChannel()
    const silent = new BroadcastChannel('peri-speaking')
    silent.postMessage({ kind: 'here' } satisfies SpeakingMessage)
    await flush()
    expect(speakingTabOpen()).toBe(true)

    inHand('Hello')
    speak('Hello', REMOTE)
    await flush()
    expect(played).toEqual([])

    vi.advanceTimersByTime(ANSWER_MS)
    await flush()
    expect(played, 'the clip went unsaid').toHaveLength(1)
    expect(speakingTabOpen(), 'the next clip would wait on it too').toBe(false)
    silent.close()
  })

  it('says nothing late for a clip somebody has moved on from', async () => {
    await open({ plays: false })
    inHand('Hello')
    speak('Hello', REMOTE)
    speak('Something else', DEVICE)
    await flush()

    expect(played).toEqual([])
    expect(spoken).toEqual(['Something else'])
  })

  // The emergency bar's path: in hand and instant, and still into the call.
  it('hands an instant clip to the tab too', async () => {
    const t = await open()
    inHand('Help me!')
    speak('Help me!', DEVICE, { voiceURI: remoteVoiceURI('v1'), instant: true })
    await flush()

    expect(t.clips).toHaveLength(1)
  })
})

it('stops the tab when something new is said', async () => {
  const t = await open()
  speak('One', DEVICE)
  speak('Two', DEVICE)
  await flush()

  expect(t.hushed()).toBe(2)
})

// A voice being tried in the picker is said to nobody.
it('leaves a preview out of the tab altogether', async () => {
  const t = await open()
  inHand('Hello')
  speak('Hello', REMOTE, { preview: true })
  speak('Hi', DEVICE, { preview: true })
  await flush()

  expect(t.shown).toEqual([])
  expect(t.clips).toEqual([])
  expect(played).toHaveLength(1)
  expect(spoken).toEqual(['Hi'])
})
