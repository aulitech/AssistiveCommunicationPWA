// The history behind Undo and Redo: a change kept as the difference it made,
// applied to the board as it stands — see src/core/history.ts.

import { describe, it, expect } from 'vitest'
import {
  applyDelta,
  diffStore,
  emptyHistory,
  HISTORY_LIMIT,
  isEmptyDelta,
  recorded,
  type Change,
} from '../../src/core/history'
import { emptyStore, loadHistory, saveHistory, type PhraseStore } from '../../src/core/store'

const board = (patch: Partial<PhraseStore> = {}): PhraseStore => ({ ...emptyStore(), ...patch })
const phrase = (id: string, text = id) => ({ id: `custom-${id}`, text, category: 'Library' })

const before = board({
  custom: [phrase('a'), phrase('b'), phrase('c')],
  overrides: { shipped: 'Reworded' },
  hidden: ['gone'],
  members: { Food: ['custom-a', 'custom-b'], Drinks: ['custom-c'] },
  voiceOverrides: { 'custom-a': { '': 'voice-1' } },
  categoryOrder: ['Drinks', 'Food'],
  emergencyOrder: ['em-1', 'em-0'],
  libraryOrder: ['custom-c', 'custom-a', 'custom-b'],
})

/** Every kind of change at once. */
const after = board({
  custom: [phrase('a', 'A, reworded'), phrase('c'), phrase('d')],
  overrides: { other: 'New words' },
  hidden: ['gone', 'shipped'],
  members: { Food: ['custom-a', 'custom-d'], Snacks: ['custom-d'] },
  voiceOverrides: { 'custom-a': { '': 'voice-2' }, 'custom-d': { '': 'voice-1' } },
  categoryOrder: ['Food', 'Snacks'],
  categorySort: 'custom',
  emergencyOrder: ['em-0', 'em-1'],
  libraryOrder: ['custom-c', 'custom-a', 'custom-d'],
})

describe('a change as the difference it made', () => {
  it('goes forward and back exactly, where nothing happened since', () => {
    expect(applyDelta(before, diffStore(before, after))).toEqual(after)
    expect(applyDelta(after, diffStore(after, before))).toEqual(before)
  })

  it('is nothing between a board and itself', () => {
    expect(isEmptyDelta(diffStore(before, before))).toBe(true)
    expect(isEmptyDelta(diffStore(before, after))).toBe(false)
  })

  // Small enough to keep fifty of: a phrase added is the phrase, not the board.
  it('holds only what changed', () => {
    const added = board({ ...before, custom: [...before.custom, phrase('d')] })
    expect(diffStore(before, added)).toEqual({ custom: { removed: [], added: [[phrase('d'), 3]], changed: [] } })
  })

  it('puts a phrase taken out of a category back in its place there', () => {
    const out = board({ ...before, members: { ...before.members, Food: ['custom-b'] } })
    expect(applyDelta(out, diffStore(out, before)).members.Food).toEqual(['custom-a', 'custom-b'])
  })

  it('brings back a category that went, and takes it again', () => {
    const without = board({ ...before, members: { Food: before.members.Food }, categoryOrder: ['Food'] })
    const back = applyDelta(without, diffStore(without, before))
    expect(back.members.Drinks).toEqual(['custom-c'])
    expect(back.categoryOrder).toEqual(['Drinks', 'Food'])
    expect(applyDelta(back, diffStore(before, without)).members).not.toHaveProperty('Drinks')
  })

  /**
   * **Applied to the board as it stands**: undoing a change leaves alone what
   * came after it — a message kept, another category's phrases, a board from
   * another device — rather than putting the whole board back as it was.
   */
  it('leaves alone what came since', () => {
    const added = board({ ...before, custom: [...before.custom, phrase('d')] })
    const since = board({
      ...added,
      custom: [...added.custom, phrase('said')],
      members: { ...added.members, Drinks: ['custom-c', 'custom-said'] },
    })

    const undone = applyDelta(since, diffStore(added, before))

    expect(undone.custom.map(p => p.id)).toEqual(['custom-a', 'custom-b', 'custom-c', 'custom-said'])
    expect(undone.members.Drinks).toEqual(['custom-c', 'custom-said'])
  })

  it('does not put an id back twice', () => {
    const out = board({ ...before, libraryOrder: ['custom-c', 'custom-b'] })
    const d = diffStore(out, before)
    expect(applyDelta(before, d).libraryOrder).toEqual(before.libraryOrder)
  })
})

describe('the history', () => {
  const change = (what: string): Change => ({ what, forward: {}, back: {} })

  it('keeps the last fifty to undo, and forgets what was undone once something new is done', () => {
    let history = { ...emptyHistory(), redo: [change('undone')] }
    for (let i = 1; i <= HISTORY_LIMIT + 2; i++) history = recorded(history, change(`Number ${i}`))

    expect(HISTORY_LIMIT).toBe(50)
    expect(history.undo).toHaveLength(50)
    expect(history.undo[0].what).toBe('Number 3')
    expect(history.redo).toEqual([])
  })

  it('reads back what it wrote', () => {
    const history = recorded(emptyHistory(), { ...change('Saved “Tea”'), phrase: 'custom-a', tab: 'Drinks' })
    saveHistory(history)
    expect(loadHistory()).toEqual(history)
  })

  // A record from a damaged write, or from a release that wrote another shape,
  // must not take the board down with it.
  it('reads damage as an empty history, and drops what is not a change', () => {
    localStorage.setItem('peri_history', '{not json')
    expect(loadHistory()).toEqual(emptyHistory())
    localStorage.setItem('peri_history', JSON.stringify({ undo: [change('kept'), { what: 3 }, null], redo: 'no' }))
    expect(loadHistory()).toEqual(emptyHistory())
    localStorage.setItem('peri_history', JSON.stringify({ undo: [change('kept'), { what: 3 }, null], redo: [] }))
    expect(loadHistory().undo.map(c => c.what)).toEqual(['kept'])
  })
})
