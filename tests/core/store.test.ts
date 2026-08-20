import { describe, it, expect } from 'vitest'
import { moveInOrder, orderEmergency } from '../../src/core/store'

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
    expect(ids(orderEmergency(phrases('em-0', 'new-a', 'em-1', 'new-b'), ['em-1', 'em-0'])))
      .toEqual(['em-1', 'em-0', 'new-a', 'new-b'])
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
