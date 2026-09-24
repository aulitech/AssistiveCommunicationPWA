import { describe, it, expect } from 'vitest'
import { PHRASES, phraseId } from '../../src/core/phrases'
import { emptyStore, fromFiled, loadPhraseStore, type FiledStore } from '../../src/core/store'

// Every phrase lives in Library and a category is a list of references to
// Library phrases. A board written before that filed each phrase under one
// category; this is it read into references, so nothing on any tab moves.

const [first, second, third] = PHRASES
const filed = (over: Partial<FiledStore>): FiledStore => {
  const { members: _m, libraryOrder: _l, ...rest } = emptyStore()
  return { ...rest, categoryRenames: {}, categories: [], categoryOverrides: {}, phraseOrder: {}, ...over }
}

describe('a board from before categories were references', () => {
  it('puts a phrase somebody wrote in Library, and has its category refer to it', () => {
    const store = fromFiled(filed({ custom: [{ id: 'custom-1', text: 'Tea please', category: 'Kitchen' }] }))
    expect(store.custom).toEqual([{ id: 'custom-1', text: 'Tea please', category: 'Library' }])
    expect(store.members).toEqual({ Kitchen: ['custom-1'] })
  })

  it('has a category refer to a phrase Peri ships that was moved into it', () => {
    const store = fromFiled(filed({ categoryOverrides: { [second.id]: 'Mine' } }))
    expect(store.members).toEqual({ Mine: [second.id] })
  })

  it('keeps the order the tab showed: its arrangement, then the board’s', () => {
    const store = fromFiled(
      filed({
        custom: [{ id: 'custom-1', text: 'Tea please', category: 'Mine' }],
        categoryOverrides: { [first.id]: 'Mine', [second.id]: 'Mine', [third.id]: 'Mine' },
        phraseOrder: { Mine: [third.id, 'custom-1'] },
      }),
    )
    expect(store.members.Mine).toEqual([third.id, 'custom-1', first.id, second.id])
  })

  it('files under the name a rename showed', () => {
    const store = fromFiled(
      filed({
        custom: [{ id: 'custom-1', text: 'Tea please', category: 'Food' }],
        categoryRenames: { Food: 'Meals' },
      }),
    )
    expect(store.members).toEqual({ Meals: ['custom-1'] })
  })

  it('keeps a category made and left empty, and drops one nothing has', () => {
    const store = fromFiled(filed({ categories: ['Later'], categoryOrder: ['Later', 'Idioms'] }))
    expect(store.members).toEqual({ Later: [] })
    expect(store.categoryOrder).toEqual(['Later'])
  })

  it('refers to nothing hidden, and leaves the emergency bar its own', () => {
    const store = fromFiled(
      filed({
        hidden: [first.id],
        categoryOverrides: { [first.id]: 'Mine' },
        custom: [{ id: 'custom-help', text: 'Help me now', category: 'Emergency' }],
      }),
    )
    expect(store.members).toEqual({})
    expect(store.custom).toEqual([{ id: 'custom-help', text: 'Help me now', category: 'Emergency' }])
  })

  it('makes Library’s arrangement Library’s order', () => {
    expect(fromFiled(filed({ phraseOrder: { Library: [second.id, first.id] } })).libraryOrder).toEqual([
      second.id,
      first.id,
    ])
  })

  // A move written against a copy dropped when the table was collapsed.
  it('counts a move of a dropped copy for the phrase it became', () => {
    const kept = PHRASES.find(p => p.source === 'Good morning')!
    const store = fromFiled(filed({ categoryOverrides: { [phraseId('Texting', 'Good morning')]: 'Mornings' } }))
    expect(store.members).toEqual({ Mornings: [kept.id] })
  })

  it('is what a board in that shape is read as', () => {
    localStorage.setItem(
      'dwellspeak_phrase_store_v2',
      JSON.stringify({ custom: [{ id: 'custom-1', text: 'Tea please', category: 'Kitchen' }], table: 2 }),
    )
    const store = loadPhraseStore()
    expect(store.members).toEqual({ Kitchen: ['custom-1'] })
    expect(store.custom[0].category).toBe('Library')
  })
})
