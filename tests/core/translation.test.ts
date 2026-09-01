// Saying a phrase in a language the board is not written in.
//
// The lookup has one property everything else rests on: **it answers
// synchronously**. The emergency bar speaks the moment it is pressed, and a
// promise there is a phrase that arrives after somebody needed it.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SOURCE_LANGUAGE,
  VARIETIES,
  baseLanguage,
  deeplTarget,
  speechTag,
  tableFor,
  forgetTranslations,
  loadTranslations,
  needsTranslation,
  rememberTranslation,
  seedTranslations,
  translationFor,
  varietyLabel,
} from '../../src/core/translation'

beforeEach(() => forgetTranslations())

describe('which languages mean translating', () => {
  it('is nothing at all when none has been chosen', () => {
    expect(needsTranslation('')).toBe(false)
  })

  // The board is written in English, so English is not a translation of it.
  it('is nothing for the language the board is already in', () => {
    expect(needsTranslation(SOURCE_LANGUAGE)).toBe(false)
    expect(needsTranslation('en-GB')).toBe(false)
    expect(needsTranslation('EN-US')).toBe(false)
  })

  it('is everything else', () => {
    expect(needsTranslation('fr')).toBe(true)
    expect(needsTranslation('es-MX')).toBe(true)
  })

  // "es-ES" and "es" are one table, and one DeepL target.
  it('reads a region off a tag', () => {
    expect(baseLanguage('es-ES')).toBe('es')
    expect(baseLanguage('FR')).toBe('fr')
  })
})

describe('what is already known', () => {
  it('finds a phrase Peri ships a translation for', () => {
    seedTranslations('es', { 'Help me!': '¡Ayúdenme!' })
    expect(translationFor('Help me!', 'es-ES')).toBe('¡Ayúdenme!')
  })

  it('knows nothing about a phrase it has never seen', () => {
    seedTranslations('es', { 'Help me!': '¡Ayúdenme!' })
    expect(translationFor('I would like a cup of tea', 'es')).toBeUndefined()
  })

  it('says nothing at all for a language that needs no translating', () => {
    seedTranslations('en', { 'Help me!': 'nonsense' })
    expect(translationFor('Help me!', 'en-GB')).toBeUndefined()
  })

  /**
   * The property the emergency bar depends on. Nothing here returns a promise,
   * so a phrase that is known is spoken in the same tick it was asked for.
   */
  it('answers without waiting', () => {
    seedTranslations('fr', { 'Help me!': 'Aidez-moi !' })
    const answer: unknown = translationFor('Help me!', 'fr')
    expect(answer).not.toBeInstanceOf(Promise)
    expect(answer).toBe('Aidez-moi !')
  })
})

describe('what has been translated before', () => {
  it('is remembered, so the second time is instant and free', () => {
    rememberTranslation('I would like a cup of tea', 'fr', 'Je voudrais une tasse de thé')
    expect(translationFor('I would like a cup of tea', 'fr')).toBe('Je voudrais une tasse de thé')
  })

  it('survives a reload', () => {
    rememberTranslation('Good morning', 'fr', 'Bonjour')
    forgetTranslations()
    // A fresh module state reads the same store back.
    expect(translationFor('Good morning', 'fr')).toBeUndefined()
    rememberTranslation('Good morning', 'fr', 'Bonjour')
    const stored = JSON.parse(localStorage.getItem('peri_translations') ?? '{}')
    expect(stored.fr['Good morning']).toBe('Bonjour')
  })

  it('keeps each language apart', () => {
    rememberTranslation('Good morning', 'fr', 'Bonjour')
    rememberTranslation('Good morning', 'es', 'Buenos días')
    expect(translationFor('Good morning', 'fr')).toBe('Bonjour')
    expect(translationFor('Good morning', 'es')).toBe('Buenos días')
  })

  it('refuses to remember nothing', () => {
    rememberTranslation('Good morning', 'fr', '')
    expect(translationFor('Good morning', 'fr')).toBeUndefined()
  })

  it('reads a damaged store as an empty one rather than falling over', () => {
    localStorage.setItem('peri_translations', '{"fr": "not a table"}')
    forgetTranslations()
    localStorage.setItem('peri_translations', '{"fr": "not a table"}')
    expect(() => translationFor('Good morning', 'fr')).not.toThrow()
    expect(translationFor('Good morning', 'fr')).toBeUndefined()
  })
})

describe('the shipped tables', () => {
  it('brings a language Peri ships into memory', async () => {
    await loadTranslations('es-ES')
    expect(translationFor('Help me!', 'es-ES')).toBe('¡Ayúdenme!')
    expect(translationFor("I can't breathe", 'es')).toBe('No puedo respirar')
  })

  it('carries every emergency phrase, which is the one bar that cannot wait', async () => {
    for (const lang of ['es', 'fr']) {
      await loadTranslations(lang)
      for (const phrase of ['Help me!', "I'm in pain", 'Call 911', 'Get a doctor', "I can't breathe", 'Call my family']) {
        expect(translationFor(phrase, lang), `${phrase} has no ${lang}`).toBeTruthy()
      }
    }
  })

  // Not a failure: everything simply comes from the cache or the translator.
  it('shrugs at a language it ships nothing for', async () => {
    await expect(loadTranslations('zu')).resolves.toBeUndefined()
    expect(translationFor('Help me!', 'zu')).toBeUndefined()
  })

  it('does not go looking for a language that needs no translating', async () => {
    await loadTranslations('en-GB')
    expect(translationFor('Help me!', 'en-GB')).toBeUndefined()
  })
})

/**
 * Ways of speaking that a tag alone does not describe.
 *
 * Three questions hide inside one — what to say it as, what to translate it
 * with, and which shipped table it reads — and for these they have three
 * different answers. Anything not listed answers all three from its base
 * language, which is right for `de-DE` and wrong for both of these.
 */
describe('a spoken variety', () => {
  it('answers all three from the base language when Peri knows nothing special', () => {
    expect(tableFor('de-DE')).toBe('de')
    expect(deeplTarget('de-DE')).toBe('DE')
    expect(speechTag('de-DE')).toBe('de-DE')
  })

  /**
   * Nobody has a Puerto Rican target — what DeepL has is Latin American
   * Spanish, which is the near side of a real divide. European Spanish would
   * give a board `vosotros`, and `coger`, which means something else in San
   * Juan.
   */
  it('sends Puerto Rican Spanish to Latin America rather than to Spain', () => {
    expect(deeplTarget('es-PR')).toBe('ES-419')
    expect(tableFor('es-PR')).toBe('es-419')
    expect(tableFor('es-PR')).not.toBe(tableFor('es-ES'))
  })

  it('says Puerto Rican Spanish as Puerto Rican Spanish', () => {
    expect(speechTag('es-PR')).toBe('es-PR')
  })

  /**
   * **Patois is a language, not an accent**, and no service translates into it
   * — DeepL carries Haitian Creole and no other. Null is the answer, and it is
   * not a missing case: it is what stops a phrase being sent somewhere that
   * would hand back English.
   */
  it('has nothing to send Patois to', () => {
    expect(deeplTarget('jam')).toBeNull()
    expect(tableFor('jam')).toBe('jam')
    expect(needsTranslation('jam')).toBe(true)
  })

  // There is no Patois voice on any device, and Patois written down is close
  // enough to English that an English voice reads it about right.
  it('says Patois as Jamaican English, there being no Patois voice anywhere', () => {
    expect(speechTag('jam')).toBe('en-JM')
  })

  it('has a name of its own for each, since a tag reads as a product code', () => {
    for (const v of VARIETIES) expect(varietyLabel(v.tag)).toBe(v.label)
    expect(varietyLabel('de-DE')).toBeUndefined()
  })

  it('carries every emergency phrase for both, which is the bar that cannot wait', async () => {
    for (const v of VARIETIES) {
      await loadTranslations(v.tag)
      for (const phrase of ['Help me!', "I'm in pain", 'Call 911', 'Get a doctor', "I can't breathe", 'Call my family']) {
        expect(translationFor(phrase, v.tag), `${phrase} has no ${v.tag}`).toBeTruthy()
      }
    }
  })

  it('keeps the two Spanishes apart in what it remembers', () => {
    rememberTranslation('Get a doctor', 'es-ES', 'Busque un médico')
    rememberTranslation('Get a doctor', 'es-PR', 'Busque un doctor')
    expect(translationFor('Get a doctor', 'es-ES')).toBe('Busque un médico')
    expect(translationFor('Get a doctor', 'es-PR')).toBe('Busque un doctor')
  })
})
