import { describe, it, expect, beforeEach } from 'vitest'
import {
  emptyStore,
  factoryReset,
  loadReplyKey,
  loadSent,
  moveInOrder,
  orderByIds,
  readPhraseOrder,
  renameCategory,
  sameAccount,
  saveReplyKey,
  saveSent,
} from '../../src/core/store'

// The arithmetic behind arranging things by hand. The two bars that use it are
// driven through the DOM — the tabs in categories.test.tsx, the emergency bar in
// emergency.test.tsx — and this is the part that decides where something lands.

const phrases = (...ids: string[]) => ids.map(id => ({ id }))
const ids = <T extends { id: string }>(list: T[]) => list.map(p => p.id)

describe('arranging the emergency bar', () => {
  const bar = phrases('em-0', 'em-1', 'em-2', 'em-3')

  // The categories fall back to alphabetical; these fall back to the order they
  // come in, which is the order Peri ships them in.
  it('leaves them exactly as they come when nothing has been arranged', () => {
    expect(orderByIds(bar, [])).toBe(bar)
  })

  it('puts them in the order asked for', () => {
    expect(ids(orderByIds(bar, ['em-2', 'em-0', 'em-3', 'em-1']))).toEqual(['em-2', 'em-0', 'em-3', 'em-1'])
  })

  // A phrase added after the bar was arranged has no place in that order. It
  // goes at the end rather than at the front, and rearranging is what moves it.
  it('files anything the order has never heard of at the end, as it came', () => {
    expect(ids(orderByIds(phrases('em-0', 'new-a', 'em-1', 'new-b'), ['em-1', 'em-0']))).toEqual([
      'em-1',
      'em-0',
      'new-a',
      'new-b',
    ])
  })

  // An order outlives the phrases in it: one naming a phrase that has since been
  // deleted must not leave a hole, or put the rest in the wrong place.
  it('skips an id that names nothing', () => {
    expect(ids(orderByIds(phrases('em-0', 'em-1'), ['em-9', 'em-1', 'em-0']))).toEqual(['em-1', 'em-0'])
  })
})

describe('moving one thing to where another sits', () => {
  const list = ['a', 'b', 'c', 'd']

  // Landing after the target going right and before it going left is what puts
  // the thing where the pointer actually is, either way.
  it('lands after the target when moving rightwards', () => {
    expect(moveInOrder(list, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('lands before the target when moving leftwards', () => {
    expect(moveInOrder(list, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone when there is nothing to do', () => {
    expect(moveInOrder(list, 'a', 'a')).toBe(list)
    expect(moveInOrder(list, 'a', 'gone')).toBe(list)
    expect(moveInOrder(list, 'gone', 'a')).toBe(list)
  })

  it('never loses or duplicates anything', () => {
    expect([...moveInOrder(list, 'b', 'd')].sort()).toEqual(list)
  })
})

/**
 * Asked before an account is written, because writing one throws away the audio
 * cached under it — and a board arriving from another device carries the
 * account whether or not that is what changed.
 */
describe('telling two linked accounts apart', () => {
  const account = (apiKey: string, voices: { id: string; name: string }[] = [{ id: 'v1', name: 'Rachel' }]) => ({
    apiKey,
    voices,
  })

  it('says nothing is the same account as nothing', () => {
    expect(sameAccount(null, null)).toBe(true)
  })

  it('tells an account from no account', () => {
    expect(sameAccount(account('sk-a'), null)).toBe(false)
    expect(sameAccount(null, account('sk-a'))).toBe(false)
  })

  it('takes two copies of the same one as the same one', () => {
    expect(sameAccount(account('sk-a'), account('sk-a'))).toBe(true)
  })

  it('tells two keys apart', () => {
    expect(sameAccount(account('sk-a'), account('sk-b'))).toBe(false)
  })

  // A key re-linked can name a different set, and a picker offering voices the
  // account no longer has is a phrase that will not speak.
  it('tells the same key with different voices apart', () => {
    expect(sameAccount(account('sk-a'), account('sk-a', []))).toBe(false)
    expect(sameAccount(account('sk-a'), account('sk-a', [{ id: 'v2', name: 'Rachel' }]))).toBe(false)
    expect(sameAccount(account('sk-a'), account('sk-a', [{ id: 'v1', name: 'Adam' }]))).toBe(false)
  })
})

// The user's own arrangement of the phrases inside a category. It belongs to the
// category, so it has to survive the category being renamed — including the
// rename that collapses two categories into one.
describe('an arrangement and the category it belongs to', () => {
  const storeWith = (phraseOrder: Record<string, string[]>, categories: string[] = []) => ({
    ...emptyStore(),
    categories,
    phraseOrder,
  })

  it('follows the category to its new name', () => {
    const next = renameCategory(storeWith({ Food: ['a', 'b'] }, ['Food']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Meals: ['a', 'b'] })
  })

  it('leaves every other category’s alone', () => {
    const next = renameCategory(storeWith({ Food: ['a'], Home: ['c'] }, ['Food', 'Home']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Meals: ['a'], Home: ['c'] })
  })

  // Renaming onto a name that already exists merges the two, so the arrangement
  // merges the same way a backup does: what arrives goes behind what was there.
  it('goes behind the one it is merged into', () => {
    const next = renameCategory(storeWith({ Food: ['a', 'b'], Home: ['c'] }, ['Food', 'Home']), 'Food', 'Home')
    expect(next.phraseOrder).toEqual({ Home: ['c', 'a', 'b'] })
  })

  it('does not list a phrase twice when both named it', () => {
    const next = renameCategory(
      storeWith({ Food: ['a', 'b'], Home: ['b', 'c'] }, ['Food', 'Home']),
      'Food',
      'Home',
    )
    expect(next.phraseOrder).toEqual({ Home: ['b', 'c', 'a'] })
  })

  it('writes nothing where there was no arrangement to move', () => {
    const next = renameCategory(storeWith({ Home: ['c'] }, ['Food', 'Home']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Home: ['c'] })
  })
})

describe('reading an arrangement back', () => {
  it('takes a category’s list of ids', () => {
    expect(readPhraseOrder({ Food: ['a', 'b'] })).toEqual({ Food: ['a', 'b'] })
  })

  it('refuses anything that is not a record of them', () => {
    for (const raw of [null, undefined, 'words', 7, ['a']]) expect(readPhraseOrder(raw)).toBeNull()
  })

  // An empty arrangement and no arrangement mean the same thing, and a store
  // that only ever accumulates is one nobody can read later.
  it('drops a category whose list holds nothing usable', () => {
    expect(readPhraseOrder({ Food: [], Home: [1, null], Meals: ['', 'a'] })).toEqual({ Meals: ['a'] })
  })

  it('drops a category whose value is not a list at all', () => {
    expect(readPhraseOrder({ Food: 'a,b', Home: ['c'] })).toEqual({ Home: ['c'] })
  })
})

/**
 * The key behind a suggested reply. Its own storage name, which matters more
 * than it looks: every one of these keys is a bare string under a bare name, so
 * two of them sharing one would have each quietly overwriting the other.
 */
describe('the key for suggested replies', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips', () => {
    saveReplyKey('sk-ant-key')
    expect(loadReplyKey()).toBe('sk-ant-key')
  })

  it('is empty before one has been given', () => {
    expect(loadReplyKey()).toBe('')
  })

  it('is trimmed on the way in, since it was pasted', () => {
    saveReplyKey('  sk-ant-key  ')
    expect(loadReplyKey()).toBe('sk-ant-key')
  })

  it('is removed by an empty one rather than stored as one', () => {
    saveReplyKey('sk-ant-key')
    saveReplyKey('   ')
    expect(loadReplyKey()).toBe('')
    expect(localStorage.getItem('peri_reply')).toBeNull()
  })

  it('is kept under a name of its own', () => {
    saveSent([{ id: 's1', text: 'I need the toilet' }])
    saveReplyKey('sk-ant-key')

    expect(loadSent()).toHaveLength(1)
    expect(localStorage.getItem('peri_reply')).toBe('sk-ant-key')
  })

  it('is cleared by a factory reset', () => {
    saveReplyKey('sk-ant-key')
    factoryReset()
    expect(loadReplyKey()).toBe('')
  })
})
