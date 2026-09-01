import { describe, it, expect } from 'vitest'
import { moveInOrder, orderEmergency, sameAccount } from '../../src/core/store'

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
    expect(orderEmergency(bar, [])).toBe(bar)
  })

  it('puts them in the order asked for', () => {
    expect(ids(orderEmergency(bar, ['em-2', 'em-0', 'em-3', 'em-1']))).toEqual(['em-2', 'em-0', 'em-3', 'em-1'])
  })

  // A phrase added after the bar was arranged has no place in that order. It
  // goes at the end rather than at the front, and rearranging is what moves it.
  it('files anything the order has never heard of at the end, as it came', () => {
    expect(ids(orderEmergency(phrases('em-0', 'new-a', 'em-1', 'new-b'), ['em-1', 'em-0']))).toEqual([
      'em-1',
      'em-0',
      'new-a',
      'new-b',
    ])
  })

  // An order outlives the phrases in it: one naming a phrase that has since been
  // deleted must not leave a hole, or put the rest in the wrong place.
  it('skips an id that names nothing', () => {
    expect(ids(orderEmergency(phrases('em-0', 'em-1'), ['em-9', 'em-1', 'em-0']))).toEqual(['em-1', 'em-0'])
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
