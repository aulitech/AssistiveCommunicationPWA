// Saying a phrase in a language the board is not written in.
//
// The lookup has one property everything else rests on: **it answers
// synchronously**. The emergency bar speaks the moment it is pressed, and a
// promise there is a phrase that arrives after somebody needed it.

import { describe, it, expect, beforeEach } from 'vitest'
import { openBoardFor, type User } from '../../src/core/store'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SOURCE_LANGUAGE,
  baseLanguage,
  translationTarget,
  tableFor,
  forgetTranslations,
  loadTranslations,
  needsTranslation,
  rememberTranslation,
  seedTranslations,
  translationFor,
} from '../../src/core/translation'

beforeEach(() => forgetTranslations())

/** The six the emergency bar speaks. Hand-written in every table, never generated. */
const EMERGENCY = ['Help me!', "I'm in pain", 'Call 911', 'Get a doctor', "I can't breathe", 'Call my family']

/** Every table in the directory, so a language added tomorrow cannot skip the check. */
const TABLES = readdirSync(resolve(process.cwd(), 'src/core/imports/translations'))
  .filter(name => name.endsWith('.json'))
  .map(name => name.replace(/\.json$/, ''))

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

  // "es-ES" and "es" are one table, and one target.
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

  // What somebody has had translated is what they said, so it is theirs: an
  // account signing in after them finds none of it, in storage or in memory.
  it('belongs to the board it was said on', () => {
    const ada: User = { name: 'Ada', email: '', provider: 'google', sub: '1' }
    const bob: User = { name: 'Bob', email: '', provider: 'google', sub: '2' }
    openBoardFor(ada)
    rememberTranslation('Good morning', 'fr', 'Bonjour')

    openBoardFor(bob)
    expect(translationFor('Good morning', 'fr'), 'a second account read the first one’s').toBeUndefined()
    rememberTranslation('Good night', 'fr', 'Bonne nuit')

    openBoardFor(ada)
    expect(translationFor('Good morning', 'fr')).toBe('Bonjour')
    expect(
      translationFor('Good night', 'fr'),
      'the second account’s went onto the first one’s board',
    ).toBeUndefined()
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
  // Without this the loop below passes by finding nothing to loop over.
  it('ships tables at all', () => {
    expect(TABLES.length, 'no shipped translation tables were found').toBeGreaterThan(0)
  })

  it('brings a language Peri ships into memory', async () => {
    await loadTranslations('es-ES')
    expect(translationFor('Help me!', 'es-ES')).toBe('¡Ayúdenme!')
    expect(translationFor("I can't breathe", 'es')).toBe('No puedo respirar')
  })

  /**
   * **Every table Peri ships, not a list somebody remembers to extend.**
   *
   * This was `['es', 'fr']`, and Vietnamese arrived carrying none of the six.
   * The tool generates from the phrase table, these six are not in it, and a
   * language with no file to merge into simply gets none. Nothing threw and no
   * test failed: the emergency bar just fell back to English, which is the one place
   * in this app that must never quietly do that.
   */
  it.each(TABLES)('carries every emergency phrase in %s, the one bar that cannot wait', async table => {
    const tag = table
    await loadTranslations(tag)
    for (const phrase of EMERGENCY) {
      expect(translationFor(phrase, tag), `${phrase} has no ${table}`).toBeTruthy()
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

// Every language answers what table it reads and what it is translated with
// from its base language: `es-MX` reads `es.json` and is asked for as `es`.
describe('a regional tag', () => {
  it('reads the table and asks the service for its base language', () => {
    expect(tableFor('de-DE')).toBe('de')
    expect(translationTarget('de-DE')).toBe('de')
    expect(tableFor('es-MX')).toBe('es')
  })

  it('has nothing to translate into for the language the board is written in', () => {
    expect(translationTarget('en-JM')).toBeNull()
    expect(translationTarget('')).toBeNull()
  })

  // Peri shipped a Latin American table for Puerto Rico and a hand-written one
  // for Jamaican Patois, and both were taken out. The tables have to go with
  // them, or a table nothing can reach is shipped to every device.
  it('ships no table for a language it no longer offers', () => {
    expect(TABLES).not.toContain('jam')
    expect(TABLES).not.toContain('es-419')
  })
})
