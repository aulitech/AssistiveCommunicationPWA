import { describe, it, expect, vi, beforeEach } from 'vitest'
import { speak } from './speech'
import { clearAudioCache, remoteVoiceURI } from './elevenlabs'
import { saveElevenLabs } from '../core/store'
import { spoken, lastUtterance, played, setAudioPlays } from '../test/setup'

// Which of the two voices a phrase comes out of, and — the point of all of it —
// that it always comes out of one of them. Somebody's only way of speaking does
// not get to depend on a request succeeding.

const SETTINGS = { voiceURI: '', volume: 0.5, rate: 1.5 }
const REMOTE = { ...SETTINGS, voiceURI: remoteVoiceURI('v1') }

const link = () => saveElevenLabs({ apiKey: 'sk-test', voices: [{ id: 'v1', name: 'Rachel' }] })

const audioReturns = (ok: boolean) =>
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (!ok) throw new TypeError('Failed to fetch')
    return { ok: true, status: 200, blob: async () => new Blob(['audio']) }
  }))

/** The fetch and the play are both promises; neither waits on a timer. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

// The shared setup stubs speechSynthesis and unstubs everything afterwards, so
// a fetch stubbed here is gone by the next test.
beforeEach(() => {
  clearAudioCache()
})

describe('with no account linked', () => {
  it('speaks on the device', () => {
    speak('Hello', SETTINGS)
    expect(spoken).toEqual(['Hello'])
    expect(lastUtterance).toMatchObject({ volume: 0.5, rate: 1.5 })
  })

  it('says nothing for nothing', () => {
    speak('   ', SETTINGS)
    expect(spoken).toEqual([])
  })

  // A backup from a device that had an account restores the chosen voice along
  // with everything else. On a device with no account it has to mean something.
  it('falls back to the device voice for a voice it cannot reach', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    speak('Hello', REMOTE)
    await flush()

    expect(spoken).toEqual(['Hello'])
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('with an account linked', () => {
  it('fetches the audio and plays it', async () => {
    link()
    audioReturns(true)
    speak('Hello', REMOTE)
    await flush()

    expect(played).toHaveLength(1)
    expect(spoken).toEqual([])
  })

  // The volume and speed controls have to keep meaning something whichever
  // voice is chosen; ElevenLabs has no speed of its own to ask for.
  it('applies the volume and speed to the audio', async () => {
    link()
    audioReturns(true)
    speak('Hello', REMOTE)
    await flush()

    expect(played[0]).toEqual({ volume: 0.5, rate: 1.5 })
  })

  it('still uses the device voice for a device voice', async () => {
    link()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    speak('Hello', SETTINGS)
    await flush()

    expect(spoken).toEqual(['Hello'])
    expect(fetcher).not.toHaveBeenCalled()
  })
})

// Every one of these ends in the words being said. Silence is the one outcome
// that is not allowed.
describe('when the account voice cannot be heard', () => {
  it('speaks on the device when the network is down', async () => {
    link()
    audioReturns(false)
    speak('Hello', REMOTE)
    await flush()

    expect(spoken).toEqual(['Hello'])
  })

  it('speaks on the device when the key has stopped working', async () => {
    link()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, blob: async () => new Blob() })))
    speak('Hello', REMOTE)
    await flush()

    expect(spoken).toEqual(['Hello'])
  })

  // Chrome refuses to play audio without a recent click. A dwell is a timer, so
  // this is not a rare case for the users this app is for.
  it('speaks on the device when the browser refuses to play the audio', async () => {
    link()
    audioReturns(true)
    setAudioPlays(false)
    speak('Hello', REMOTE)
    await flush()

    expect(spoken).toEqual(['Hello'])
  })
})

describe('being interrupted', () => {
  // The reply to a phrase already abandoned would otherwise arrive and speak
  // over the top of the one the user actually asked for.
  it('drops audio that arrives after something else was asked for', async () => {
    link()
    audioReturns(true)
    speak('First', REMOTE)
    speak('Second', SETTINGS)
    await flush()

    expect(spoken).toEqual(['Second'])
    expect(played).toEqual([])
  })

  it('does not fall back for an utterance that was already replaced', async () => {
    link()
    audioReturns(false)
    speak('First', REMOTE)
    speak('Second', SETTINGS)
    await flush()

    expect(spoken).toEqual(['Second'])
  })
})

describe('phrases that must not wait', () => {
  // The emergency bar. A request going out and coming back is not what "I can't
  // breathe" needs, and with the network down it is nothing at all.
  it('always uses the device voice, whatever is chosen', async () => {
    link()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    speak('Help me!', REMOTE, { local: true })
    await flush()

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
