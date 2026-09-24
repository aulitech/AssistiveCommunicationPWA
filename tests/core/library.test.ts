import { describe, it, expect } from 'vitest'
import { FORMER_IDS, PHRASES, phraseId } from '../../src/core/phrases'
import { emptyStore, foldFormerCopies, loadPhraseStore, loadUsage, savePhraseStore } from '../../src/core/store'

// Every phrase Peri ships went into Library, and each wording was kept once.
// What somebody had done to a copy that was dropped — reworded it, given it a
// voice, used it a hundred times — is written against that copy's id, so it is
// moved onto the phrase the copy was folded into. `core/phrases.test.ts` holds
// the table itself to this; these are about what happens to a board.

// Two copies folded into one, as the table's own map says.
const former = new Map([
  ['copy-a', 'kept'],
  ['copy-b', 'kept'],
])

describe('folding the dropped copies into the phrase that stayed', () => {
  it('moves what only a copy had, and keeps the phrase’s own where both have one', () => {
    const folded = foldFormerCopies(
      {
        ...emptyStore(),
        overrides: { 'copy-a': 'Copy A reworded', other: 'Untouched' },
      },
      former,
    )
    expect(folded.overrides).toEqual({ kept: 'Copy A reworded', other: 'Untouched' })

    const own = foldFormerCopies(
      { ...emptyStore(), overrides: { 'copy-a': 'From the copy', kept: 'Its own' } },
      former,
    )
    expect(own.overrides).toEqual({ kept: 'Its own' })
  })

  it('takes the first copy’s where two copies both had one', () => {
    const folded = foldFormerCopies(
      { ...emptyStore(), overrides: { 'copy-a': 'First', 'copy-b': 'Second' } },
      former,
    )
    expect(folded.overrides).toEqual({ kept: 'First' })
  })

  // A voice is per language, so a copy's voice for one language and the
  // phrase's own for another are both kept.
  it('gathers voices language by language', () => {
    const folded = foldFormerCopies(
      {
        ...emptyStore(),
        voiceOverrides: { 'copy-a': { '': 'copy-voice', es: 'copy-spanish' }, kept: { es: 'own-spanish' } },
      },
      former,
    )
    expect(folded.voiceOverrides).toEqual({ kept: { '': 'copy-voice', es: 'own-spanish' } })
  })

  it('names the phrase that stayed in every category and arrangement, once', () => {
    const folded = foldFormerCopies(
      {
        ...emptyStore(),
        members: { Favourites: ['x', 'copy-a', 'kept', 'copy-b'] },
        libraryOrder: ['copy-b', 'y'],
        emergencyOrder: ['copy-b', 'em-0'],
      },
      former,
    )
    expect(folded.members).toEqual({ Favourites: ['x', 'kept'] })
    expect(folded.libraryOrder).toEqual(['kept', 'y'])
    expect(folded.emergencyOrder).toEqual(['kept', 'em-0'])
  })

  describe('hiding', () => {
    it('drops a copy’s own entry, and leaves the phrase as it was', () => {
      expect(foldFormerCopies({ ...emptyStore(), hidden: ['copy-a', 'x'] }, former).hidden).toEqual(['x'])
      expect(foldFormerCopies({ ...emptyStore(), hidden: ['kept', 'x'] }, former).hidden).toEqual(['kept', 'x'])
    })

    // Somebody who deleted one copy and kept another still had it on their
    // board. The first look after the collapse brings it back.
    it('brings the phrase back, the first time, where a copy of it was still showing', () => {
      const store = { ...emptyStore(), hidden: ['kept', 'copy-a'] }
      expect(foldFormerCopies(store, former, true).hidden).toEqual([])
    })

    it('leaves it hidden where every copy was', () => {
      const store = { ...emptyStore(), hidden: ['kept', 'copy-a', 'copy-b'] }
      expect(foldFormerCopies(store, former, true).hidden).toEqual(['kept'])
    })
  })

  it('passes a board that never touched a copy through untouched', () => {
    const store = { ...emptyStore(), overrides: { x: 'Mine' }, hidden: ['y'], members: { A: ['x'] } }
    expect(foldFormerCopies(store, former, true)).toEqual(store)
  })
})

// The real table: one phrase that had copies, and one of the copies.
const kept = PHRASES.find(p => p.source === 'Good morning')!
const copy = phraseId('Texting', 'Good morning')

describe('a board written before the collapse', () => {
  const KEY = 'dwellspeak_phrase_store_v2'

  it('knows the copies of the real table', () => {
    expect(FORMER_IDS.get(copy)).toBe(kept.id)
  })

  it('is folded as it is read', () => {
    localStorage.setItem(KEY, JSON.stringify({ overrides: { [copy]: 'Morning, all' } }))
    expect(loadPhraseStore().overrides).toEqual({ [kept.id]: 'Morning, all' })
  })

  it('brings back a phrase hidden where another copy was showing, until it is saved', () => {
    localStorage.setItem(KEY, JSON.stringify({ hidden: [kept.id] }))
    expect(loadPhraseStore().hidden).toEqual([])
    // Read again, unsaved: the same store, so the same answer.
    expect(loadPhraseStore().hidden).toEqual([])
  })

  // After a save it is hidden because they hid it — and a copy that no longer
  // exists is not a reason to bring it back.
  it('keeps a phrase hidden once the board has been saved since', () => {
    savePhraseStore({ ...emptyStore(), hidden: [kept.id] })
    expect(JSON.parse(localStorage.getItem(KEY)!).table).toBe(3)
    expect(loadPhraseStore().hidden).toEqual([kept.id])
  })

  it('counts a copy’s uses towards the phrase it was folded into', () => {
    localStorage.setItem(
      'peri_usage',
      JSON.stringify({
        [copy]: { count: 3, at: 100 },
        [kept.id]: { count: 2, at: 50 },
        other: { count: 1, at: 7 },
      }),
    )
    expect(loadUsage()).toEqual({ [kept.id]: { count: 5, at: 100 }, other: { count: 1, at: 7 } })
  })
})
