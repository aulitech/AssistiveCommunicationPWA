import { describe, it, expect } from 'vitest'
import { plainPhrase } from '../../src/core/phrases'
import { categoriesInUse, withoutEmptyCategories } from '../../src/core/board'
import { emptyStore } from '../../src/core/store'

// A board built by hand: two shipped phrases in Library, and whatever each test
// writes.
const TABLE = [plainPhrase('s1', 'Hello', 'Library'), plainPhrase('s2', 'Goodbye', 'Library')]

describe('which categories have something in them', () => {
  it('counts a shipped phrase where it shows, and not once hidden', () => {
    expect([...categoriesInUse(TABLE, emptyStore())]).toEqual(['Library'])
    expect([...categoriesInUse(TABLE, { ...emptyStore(), hidden: ['s1', 's2'] })]).toEqual([])
  })

  it('follows a phrase somebody moved, and a rename', () => {
    const store = {
      ...emptyStore(),
      categoryOverrides: { s1: 'Mine' },
      categoryRenames: { Library: 'Everything' },
    }
    expect([...categoriesInUse(TABLE, store)].sort()).toEqual(['Everything', 'Mine'])
  })

  // The emergency bar is not a tab, whatever holds it.
  it('does not count the emergency bar', () => {
    const store = {
      ...emptyStore(),
      hidden: ['s1', 's2'],
      custom: [{ id: 'custom-1', text: 'Help', category: 'Emergency' }],
    }
    expect([...categoriesInUse(TABLE, store)]).toEqual([])
  })
})

describe('taking away a category nothing is left in', () => {
  const store = {
    ...emptyStore(),
    custom: [{ id: 'custom-1', text: 'Tea please', category: 'Drinks' }],
    categories: ['Drinks', 'Empty', 'Also empty'],
    categoryOrder: ['Empty', 'Drinks', 'Library', 'Also empty'],
    phraseOrder: { Empty: ['gone'], Drinks: ['custom-1'] },
  }

  it('takes every empty one, with its place and its arrangement, when none are named', () => {
    const next = withoutEmptyCategories(TABLE, store)
    expect(next.categories).toEqual(['Drinks'])
    expect(next.categoryOrder).toEqual(['Drinks', 'Library'])
    expect(next.phraseOrder).toEqual({ Drinks: ['custom-1'] })
  })

  // A category made a moment ago and not yet filled must survive a delete
  // somewhere else.
  it('takes only the ones named', () => {
    const next = withoutEmptyCategories(TABLE, store, ['Empty'])
    expect(next.categories).toEqual(['Drinks', 'Also empty'])
    expect(next.categoryOrder).toEqual(['Drinks', 'Library', 'Also empty'])
  })

  it('leaves a named one that still has something in it', () => {
    expect(withoutEmptyCategories(TABLE, store, ['Drinks'])).toBe(store)
  })
})
