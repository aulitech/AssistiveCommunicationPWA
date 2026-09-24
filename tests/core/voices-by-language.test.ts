// A voice per language, and a voice per phrase per language.
//
// **A voice is a language.** Switching the board between two of them used to
// throw the old voice away and let the browser pick, which made choosing one a
// thing to redo rather than a thing to set — somebody working in two languages
// was picking a voice twice a day. These are the rules that stop that, and the
// one rule that has to survive them: an English voice must never read Spanish.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS,
  chooseLanguage,
  chooseVoice,
  loadPhraseStore,
  readVoiceOverrides,
  savePhraseStore,
  setVoiceOverride,
  emptyStore,
  voiceOverrideFor,
  type Settings,
} from '../../src/core/store'

/** The real key, which is older than the app's current name. */
const STORE_KEY = 'dwellspeak_phrase_store_v2'

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

/**
 * **The device's voices, and only those.** `subscribeVoices` reports what the
 * synthesiser has; an ElevenLabs voice is never among them, which is exactly
 * what leaves it alone below rather than any special case for it.
 */
const VOICES = [
  { voiceURI: 'Samantha', lang: 'en-US' },
  { voiceURI: 'Monica', lang: 'es-ES' },
]

beforeEach(() => localStorage.clear())

describe('choosing a voice', () => {
  it('is also choosing it for the language on now', () => {
    const before = settings({ language: 'es-MX' })
    expect(chooseVoice(before, 'Monica')).toEqual({
      voiceURI: 'Monica',
      voicesByLanguage: { 'es-MX': 'Monica' },
    })
  })

  // Empty is a real key: a board following the device is a setting somebody
  // chose a voice under like any other.
  it('remembers one chosen while the board follows the device', () => {
    expect(chooseVoice(settings(), 'Samantha').voicesByLanguage).toEqual({ '': 'Samantha' })
  })

  it("keeps every other language's", () => {
    const before = settings({ language: 'vi', voicesByLanguage: { '': 'Samantha', 'es-MX': 'Monica' } })
    expect(chooseVoice(before, 'Linh').voicesByLanguage).toEqual({
      '': 'Samantha',
      'es-MX': 'Monica',
      vi: 'Linh',
    })
  })

  /**
   * Going back to the default is a choice too, and an empty string is not the
   * way to record it — an absent key already means "no voice of its own", and a
   * stored empty one would only be a thing to guard against everywhere later.
   */
  it('forgets rather than remembering nothing', () => {
    const before = settings({ language: 'vi', voicesByLanguage: { vi: 'Linh', '': 'Samantha' } })
    expect(chooseVoice(before, '').voicesByLanguage).toEqual({ '': 'Samantha' })
  })
})

describe('switching the board to another language', () => {
  it('brings back the voice it was last spoken in', () => {
    const before = settings({ language: '', voiceURI: 'Samantha', voicesByLanguage: { 'es-MX': 'Monica' } })
    const after = chooseLanguage(before, 'es-MX', VOICES)
    expect(after.language).toBe('es-MX')
    expect(after.voiceURI).toBe('Monica')
  })

  it('and back again, which is the whole point', () => {
    let s = settings({ voiceURI: 'Samantha', voicesByLanguage: { '': 'Samantha' } })
    s = { ...s, ...chooseLanguage(s, 'es-MX', VOICES) }
    s = { ...s, ...chooseVoice(s, 'Monica') }
    s = { ...s, ...chooseLanguage(s, '', VOICES) }
    expect(s.voiceURI, 'the English voice did not come back').toBe('Samantha')
    s = { ...s, ...chooseLanguage(s, 'es-MX', VOICES) }
    expect(s.voiceURI, 'the Spanish voice did not come back').toBe('Monica')
  })

  /**
   * The outgoing voice is written down **on the way out**, not only when it was
   * picked. A device restored from a backup written before any of this existed
   * has a `voiceURI` and an empty map, and without this the first switch away
   * would throw that voice away — the exact loss this feature exists to stop.
   */
  it('writes down the voice it is leaving, even if it was never chosen here', () => {
    const before = settings({ language: '', voiceURI: 'Samantha', voicesByLanguage: {} })
    const after = chooseLanguage(before, 'es-MX', VOICES)
    expect(after.voicesByLanguage).toMatchObject({ '': 'Samantha' })
  })

  // The old rule, still standing where there is nothing remembered: an English
  // voice left selected under a board set to speak French reads as broken, and
  // the browser picks a better one when asked for none.
  it('lets go of a mismatched voice where it has nothing to put back', () => {
    const before = settings({ language: '', voiceURI: 'Samantha', voicesByLanguage: {} })
    expect(chooseLanguage(before, 'es-ES', VOICES).voiceURI).toBe('')
  })

  /**
   * An ElevenLabs voice has no language of its own and speaks whatever it is
   * given, so there is nothing for it to mismatch — and it is not in the
   * device's list at all, which is what carries it past the check rather than a
   * special case naming it.
   */
  it('leaves an account voice alone', () => {
    const before = settings({ language: '', voiceURI: 'eleven:xY9', voicesByLanguage: {} })
    expect(chooseLanguage(before, 'es-ES', VOICES).voiceURI, 'an account voice was let go of').toBeUndefined()
  })
})

/**
 * A phrase's own voice, kept the same way and for the same reason. A board that
 * speaks Spanish on Tuesday and English on Wednesday needs both answers kept,
 * or choosing a Spanish voice for a phrase throws away the English one it had.
 */
describe("a phrase's own voice", () => {
  const overrides = { a1: { '': 'Samantha', 'es-MX': 'Monica' }, b2: { 'es-MX': 'eleven:xY9' } }

  it('is the one for the language the board is speaking', () => {
    expect(voiceOverrideFor(overrides, 'a1', '')).toBe('Samantha')
    expect(voiceOverrideFor(overrides, 'a1', 'es-MX')).toBe('Monica')
  })

  /**
   * **No falling back to another language.** A phrase given an English voice
   * has not been given a Spanish one, and reading Spanish words with an English
   * synthesiser is worse than reading them with the board's own voice — which
   * is what nothing here means.
   */
  it('is nothing at a language it was never given one for', () => {
    expect(voiceOverrideFor(overrides, 'b2', '')).toBeUndefined()
    expect(voiceOverrideFor(overrides, 'a1', 'vi')).toBeUndefined()
  })

  it('is nothing for a phrase that has none at all', () => {
    expect(voiceOverrideFor(overrides, 'nobody', '')).toBeUndefined()
  })
})

/**
 * Giving one phrase a voice, which must leave every other language's alone.
 *
 * This is the promise the whole feature makes, and it was the one mutation that
 * survived: wiping the record instead of copying it passed every test, because
 * the arithmetic was inside a hook nothing could reach.
 */
describe('giving a phrase a voice for one language', () => {
  it('keeps the voices it has for every other', () => {
    const before = { a1: { '': 'Samantha', vi: 'Linh' } }
    expect(setVoiceOverride(before, 'a1', 'es-MX', 'Monica')).toEqual({
      a1: { '': 'Samantha', vi: 'Linh', 'es-MX': 'Monica' },
    })
  })

  it('leaves every other phrase alone', () => {
    const before = { a1: { '': 'Samantha' }, b2: { vi: 'Linh' } }
    expect(setVoiceOverride(before, 'a1', 'vi', 'Linh').b2).toEqual({ vi: 'Linh' })
  })

  it('replaces the one for that language rather than adding a second', () => {
    const before = { a1: { vi: 'Linh' } }
    expect(setVoiceOverride(before, 'a1', 'vi', 'Mai')).toEqual({ a1: { vi: 'Mai' } })
  })

  it('takes one away without touching the rest', () => {
    const before = { a1: { '': 'Samantha', vi: 'Linh' } }
    expect(setVoiceOverride(before, 'a1', 'vi', undefined)).toEqual({ a1: { '': 'Samantha' } })
  })

  /**
   * An empty record left behind would be a phrase that reads as having a voice
   * to everything that counts them — the audio warm-up fetches for it, a backup
   * carries it.
   */
  it('drops the phrase entirely once it has no voices left', () => {
    expect(setVoiceOverride({ a1: { vi: 'Linh' } }, 'a1', 'vi', undefined)).toEqual({})
  })

  it('gives a voice to a phrase that had none', () => {
    expect(setVoiceOverride({}, 'a1', 'vi', 'Linh')).toEqual({ a1: { vi: 'Linh' } })
  })

  it('does not write into the record it was given', () => {
    const before = { a1: { '': 'Samantha' } }
    setVoiceOverride(before, 'a1', 'vi', 'Linh')
    expect(before).toEqual({ a1: { '': 'Samantha' } })
  })
})

/**
 * A store written before voices were per-language. A backup is a file people
 * keep and a device is a thing people carry, so both shapes have to read.
 */
describe('a store from before this existed', () => {
  it('reads its one voice as the voice for the board following the device', () => {
    expect(readVoiceOverrides({ a1: 'Samantha' })).toEqual({ a1: { '': 'Samantha' } })
  })

  it('reads the new shape as itself', () => {
    expect(readVoiceOverrides({ a1: { vi: 'Linh' } })).toEqual({ a1: { vi: 'Linh' } })
  })

  it('survives a real load off a store written the old way', () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...emptyStore(), voiceOverrides: { a1: 'Samantha' } }))
    expect(loadPhraseStore().voiceOverrides).toEqual({ a1: { '': 'Samantha' } })
  })

  it('drops what is not a voice rather than carrying it to a synthesiser', () => {
    expect(readVoiceOverrides({ a1: 42, b2: { vi: null }, c3: '', d4: { vi: 'Linh' } })).toEqual({
      d4: { vi: 'Linh' },
    })
  })

  it('reads a damaged store as an empty one rather than falling over', () => {
    expect(readVoiceOverrides('not a table')).toBeNull()
    localStorage.setItem(STORE_KEY, JSON.stringify({ voiceOverrides: 'nonsense' }))
    expect(() => loadPhraseStore()).not.toThrow()
    expect(loadPhraseStore().voiceOverrides).toEqual({})
  })

  it('round-trips through a save', () => {
    const store = { ...emptyStore(), voiceOverrides: { a1: { '': 'Samantha', vi: 'Linh' } } }
    savePhraseStore(store)
    expect(loadPhraseStore().voiceOverrides).toEqual({ a1: { '': 'Samantha', vi: 'Linh' } })
  })
})
