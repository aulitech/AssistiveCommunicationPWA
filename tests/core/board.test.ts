import { describe, it, expect } from 'vitest'
import { plainPhrase } from '../../src/core/phrases'
import { categoriesInUse, libraryOf, phrasesIn, withoutEmptyCategories } from '../../src/core/board'
import { emptyStore } from '../../src/core/store'

// A board built by hand: two shipped phrases, and whatever each test writes.
const TABLE = [plainPhrase('s1', 'Hello', 'Library'), plainPhrase('s2', 'Goodbye', 'Library')]

describe('Library', () => {
  it('holds every phrase on the board, the table’s and then the ones somebody wrote', () => {
    const store = {
      ...emptyStore(),
      custom: [
        { id: 'custom-1', text: 'Tea please', category: 'Library' },
        { id: 'custom-help', text: 'Help now', category: 'Emergency' },
      ],
      hidden: ['s2'],
      overrides: { s1: 'Hello there' },
    }
    expect(libraryOf(TABLE, store).map(p => [p.id, p.text, p.category])).toEqual([
      ['s1', 'Hello there', 'Library'],
      ['custom-1', 'Tea please', 'Library'],
    ])
  })
})

describe('a category', () => {
  it('is the Library phrases it refers to, in its own order, skipping any not on the board', () => {
    const store = { ...emptyStore(), members: { Mine: ['s2', 'gone', 's1'] } }
    const library = libraryOf(TABLE, store)
    expect(phrasesIn('Mine', library, store).map(p => p.id)).toEqual(['s2', 's1'])
    expect(phrasesIn('Library', library, store)).toBe(library)
    expect(phrasesIn('Nothing', library, store)).toEqual([])
  })
})

describe('which categories have something in them', () => {
  it('counts one that refers to a phrase on the board, and not one whose phrases are gone', () => {
    const store = { ...emptyStore(), members: { Live: ['s1'], Hidden: ['s2'], Empty: [] }, hidden: ['s2'] }
    expect([...categoriesInUse(TABLE, store)]).toEqual(['Live'])
  })
})

describe('taking away a category nothing is left in', () => {
  const store = {
    ...emptyStore(),
    members: { Drinks: ['s1'], Empty: [], 'Also empty': ['gone'] },
    categoryOrder: ['Empty', 'Drinks', 'Also empty'],
  }

  it('takes every empty one, with its place, when none are named', () => {
    const next = withoutEmptyCategories(TABLE, store)
    expect(next.members).toEqual({ Drinks: ['s1'] })
    expect(next.categoryOrder).toEqual(['Drinks'])
  })

  // A category made a moment ago and not yet filled must survive a delete
  // somewhere else.
  it('takes only the ones named', () => {
    const next = withoutEmptyCategories(TABLE, store, ['Empty'])
    expect(next.members).toEqual({ Drinks: ['s1'], 'Also empty': ['gone'] })
    expect(next.categoryOrder).toEqual(['Drinks', 'Also empty'])
  })

  it('leaves a named one that still has something in it', () => {
    expect(withoutEmptyCategories(TABLE, store, ['Drinks'])).toBe(store)
  })
})
