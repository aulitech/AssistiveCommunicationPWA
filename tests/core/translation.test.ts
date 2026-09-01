// Saying a phrase in a language the board is not written in.
//
// The lookup has one property everything else rests on: **it answers
// synchronously**. The emergency bar speaks the moment it is pressed, and a
// promise there is a phrase that arrives after somebody needed it.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SOURCE_LANGUAGE,
  baseLanguage,
  forgetTranslations,
  loadTranslations,
  needsTranslation,
  rememberTranslation,
  seedTranslations,
  translationFor,
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
