import { describe, it, expect, vi, beforeEach } from 'vitest'
import { speak, warmVoice } from '../../src/voice/speech'
import { remoteVoiceURI } from '../../src/voice/elevenlabs'
import { audioKey, cachedAudio, clearAudioCache, rememberAudio } from '../../src/voice/audio-cache'
import { saveElevenLabs } from '../../src/core/store'
import { forgetTranslations, rememberTranslation, seedTranslations, translationFor } from '../../src/core/translation'
import { spoken, lastUtterance, played, setAudioPlays, voices } from '../setup'

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

describe("a phrase's own voice", () => {
  it('wins over the one in settings', async () => {
    link()
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
    vi.stubGlobal('fetch', fetcher)
    speak('Hello', SETTINGS, { voiceURI: remoteVoiceURI('v1') })
    await flush()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain('/text-to-speech/v1')
    expect(played).toHaveLength(1)
  })

  it('falls back like any other when it cannot be fetched', async () => {
    link()
    audioReturns(false)
    speak('Hello', SETTINGS, { voiceURI: remoteVoiceURI('v1') })
    await flush()

    expect(spoken).toEqual(['Hello'])
  })
})

describe('phrases that must not wait', () => {
  // The emergency bar. A request going out and coming back is not what "I can't
  // breathe" needs, and with the network down it is nothing at all.
  it('uses the device rather than waiting for a voice it does not have', async () => {
    link()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    speak('Help me!', REMOTE, { instant: true })
    await flush()

    expect(spoken).toEqual(['Help me!'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  // The point of fetching a phrase's audio the moment its voice is assigned:
  // by the time it is needed it is already here, so there is nothing to wait for
  // and the emergency bar can use it.
  it('uses a voice it does have, without asking for anything', async () => {
    link()
    rememberAudio(audioKey('v1', 'Help me!'), new Blob(['audio']))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    speak('Help me!', SETTINGS, { voiceURI: remoteVoiceURI('v1'), instant: true })
    await flush()

    expect(played).toHaveLength(1)
    expect(spoken).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  // Even in hand, the browser can still refuse to play it.
  it('still falls back to the device if the audio will not play', async () => {
    link()
    rememberAudio(audioKey('v1', 'Help me!'), new Blob(['audio']))
    setAudioPlays(false)

    speak('Help me!', SETTINGS, { voiceURI: remoteVoiceURI('v1'), instant: true })
    await flush()

    expect(spoken).toEqual(['Help me!'])
  })
})

describe('warming a voice', () => {
  it('fetches once and leaves it in hand', async () => {
    link()
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, blob: async () => new Blob(['audio']) }))
    vi.stubGlobal('fetch', fetcher)

    expect(await warmVoice('Help me!', remoteVoiceURI('v1'))).toBe(true)
    expect(cachedAudio(audioKey('v1', 'Help me!'))).toBeInstanceOf(Blob)

    // And now saying it asks for nothing.
    speak('Help me!', SETTINGS, { voiceURI: remoteVoiceURI('v1'), instant: true })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(played).toHaveLength(1)
  })

  it('says so rather than throwing when it cannot', async () => {
    link()
    audioReturns(false)
    expect(await warmVoice('Help me!', remoteVoiceURI('v1'))).toBe(false)
  })

  it('does nothing for a device voice, which needs no fetching', async () => {
    link()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await warmVoice('Help me!', 'uri-Daniel')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

/**
 * The language the board is spoken in.
 *
 * A voice is a stronger statement than a language and wins wherever there is
 * one. What the setting is really for is the case where there is not: a
 * `voiceURI` is a platform string and it travels between devices, so a board
 * set up on a Mac arrives on a phone naming a voice that does not exist there.
 * Without a language that falls all the way back to whatever the *system*
 * speaks, and an English board gets read aloud by a Spanish voice.
 */
describe('the spoken language', () => {
  const daniel = { voiceURI: 'uri-Daniel', name: 'Daniel', lang: 'en-GB' } as SpeechSynthesisVoice

  beforeEach(() => {
    voices.length = 0
    voices.push(daniel)
  })

  it('is left to the device when nothing has been chosen', () => {
    speak('Hello', SETTINGS)
    expect(lastUtterance?.lang).toBe('')
  })

  it('is spoken in the chosen language when no voice has been picked', () => {
    speak('Hello', { ...SETTINGS, language: 'fr-FR' })
    expect(lastUtterance?.lang).toBe('fr-FR')
  })

  // The voice carries its own language, and choosing one is the more specific
  // thing to have said.
  it('gives way to a voice that was actually chosen', () => {
    speak('Hello', { ...SETTINGS, voiceURI: 'uri-Daniel', language: 'fr-FR' })
    expect(lastUtterance?.voice).toBe(daniel)
    expect(lastUtterance?.lang).toBe('en-GB')
  })

  /**
   * The case the setting exists for. The board names a voice this device has
   * never heard of — it came from another one — and the language is all that is
   * left to go on.
   */
  it('catches a board whose voice does not exist on this device', () => {
    speak('Hello', { ...SETTINGS, voiceURI: 'com.microsoft.Hazel', language: 'en-GB' })
    expect(lastUtterance?.voice).toBeFalsy()
    expect(lastUtterance?.lang, 'fell back to whatever the system speaks').toBe('en-GB')
  })

  it('leaves it to the device when there is no language to fall back on either', () => {
    speak('Hello', { ...SETTINGS, voiceURI: 'com.microsoft.Hazel' })
    expect(lastUtterance?.lang).toBe('')
  })
})

/**
 * Speaking a board in a language it is not written in.
 *
 * The board stays as it was written — somebody reads their own phrases in their
 * own words — and what comes out is translated, so a listener who does not
 * share that language hears it.
 *
 * Two rules run through all of it. **Never silence**: a phrase that cannot be
 * translated is said as it was written, because a listener who has to work at
 * it is recoverable and nothing said at all is not. And **the emergency bar
 * never waits**, which is the reason the lookup is synchronous.
 */
describe('speaking a translated board', () => {
  const FRENCH = { ...SETTINGS, language: 'fr-FR' }

  beforeEach(() => {
    forgetTranslations()
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')
  })

  it('says the translation Peri ships', () => {
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })
    speak('Help me!', FRENCH)
    expect(spoken).toEqual(['Aidez-moi !'])
  })

  it('says one translated before, without asking again', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    rememberTranslation('Good morning', 'fr', 'Bonjour')
    speak('Good morning', FRENCH)
    expect(spoken).toEqual(['Bonjour'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('leaves the board alone when it is spoken in its own language', () => {
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })
    speak('Help me!', { ...SETTINGS, language: 'en-GB' })
    expect(spoken).toEqual(['Help me!'])
  })

  /**
   * The emergency bar, which will not wait on a network. A phrase Peri ships a
   * translation for is said in that language *now*; one it does not is said in
   * the original rather than a second and a half later.
   */
  it('never waits, and never goes quiet, on the emergency bar', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })

    speak('Help me!', FRENCH, { instant: true })
    expect(spoken).toEqual(['Aidez-moi !'])

    speak('Something nobody has said before', FRENCH, { instant: true })
    expect(spoken[1], 'the bar went quiet waiting on a translation').toBe('Something nobody has said before')
    expect(fetcher, 'the emergency bar went to the network').not.toHaveBeenCalled()
  })

  it('says the words as written when there is no key to translate with', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    speak('Something nobody has said before', FRENCH)
    expect(spoken).toEqual(['Something nobody has said before'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('translates a phrase of your own, then keeps it', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ data: { translations: [{ translatedText: "J'ai froid" }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ))

    speak("I'm cold", FRENCH)
    await flush()
    expect(spoken).toEqual(["J'ai froid"])
    expect(translationFor("I'm cold", 'fr')).toBe("J'ai froid")
  })

  it('falls back to the written words when the translator will not answer', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    speak("I'm cold", FRENCH)
    await flush()
    expect(spoken, 'a phrase was lost to a failed translation').toEqual(["I'm cold"])
  })

  // Markup comes off before anything is looked up, so `**Help me!**` and
  // `Help me!` are one translation rather than two that never match.
  it('looks up the words, not the markup', () => {
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })
    speak('**Help me!**', FRENCH)
    expect(spoken).toEqual(['Aidez-moi !'])
  })
})

/**
 * Patois, which nothing translates into.
 *
 * The shipped table is the whole of the answer here, and the property that
 * matters is the one that stops it going wrong quietly: a phrase outside that
 * table must not be sent to a service that would hand back English and call it
 * Patois.
 */
describe('speaking a board in Jamaican Patois', () => {
  const PATOIS = { ...SETTINGS, language: 'jam' }

  beforeEach(() => {
    forgetTranslations()
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')
  })

  it('says what the shipped table says', () => {
    seedTranslations('jam', { 'Help me!': 'Help mi!' })
    speak('Help me!', PATOIS)
    expect(spoken).toEqual(['Help mi!'])
  })

  /**
   * Not merely "does not send it" but "does not go away and think about it".
   * Asserted before anything is flushed: a language nothing translates has
   * nothing to wait for, so the words go out in the same tick they were asked
   * for, exactly as an untranslated board does.
   */
  it('speaks a phrase it has no translation for straight away', () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    speak('Something nobody has said before', PATOIS)
    expect(spoken, 'the phrase was deferred to a translation that can never come').toEqual([
      'Something nobody has said before',
    ])
    expect(fetcher, 'a phrase went to a service that has no Patois').not.toHaveBeenCalled()
  })

  it('never sends a phrase anywhere, even with a key in hand', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    speak('Something nobody has said before', PATOIS)
    await flush()
    expect(fetcher, 'a phrase went to a service that has no Patois').not.toHaveBeenCalled()
    expect(spoken, 'and it was said as it was written').toEqual(['Something nobody has said before'])
  })

  // There is no Patois voice anywhere, so the synthesiser is told the nearest
  // thing there is.
  it('is spoken as Jamaican English', () => {
    seedTranslations('jam', { 'Help me!': 'Help mi!' })
    speak('Help me!', PATOIS)
    expect(lastUtterance?.lang).toBe('en-JM')
  })
})

describe('speaking a board in Puerto Rican Spanish', () => {
  const PUERTO_RICO = { ...SETTINGS, language: 'es-PR' }

  beforeEach(() => {
    forgetTranslations()
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', '')
  })

  it('is spoken as Puerto Rican Spanish, not as Spanish', () => {
    seedTranslations('es-PR', { 'Help me!': '¡Ayúdenme!' })
    speak('Help me!', PUERTO_RICO)
    expect(lastUtterance?.lang).toBe('es-PR')
  })

  /**
   * The regional wording lives in the **shipped table**, which is Latin
   * American Spanish. The service is asked for the closest thing it offers to
   * a page — plain `es` — because Google's own `es-419` is on the LLM model,
   * which wants a service account rather than a key.
   *
   * So a phrase Peri ships sounds Puerto Rican and one written here sounds
   * Spanish, which is the honest state of it and worth pinning rather than
   * pretending otherwise.
   */
  it('asks the service for the closest Spanish it has', async () => {
    vi.stubEnv('VITE_GOOGLE_TRANSLATE_KEY', 'key-1234')
    let asked = ''
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      asked = String(init.body)
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'Tengo frío' }] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetcher)

    speak("I'm cold", PUERTO_RICO)
    await flush()
    expect(JSON.parse(asked).target).toBe('es')
  })

  // And the shipped table is what carries the difference.
  it('keeps its own table, not the one plain Spanish reads', async () => {
    seedTranslations('es-PR', { 'Get a doctor': 'Busque un doctor' })
    seedTranslations('es-ES', { 'Get a doctor': 'Busque un médico' })
    speak('Get a doctor', PUERTO_RICO)
    expect(spoken).toEqual(['Busque un doctor'])
  })
})
