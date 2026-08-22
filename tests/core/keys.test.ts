// The layout, as arithmetic.
//
// A frequency layout is only worth its unfamiliarity if it actually puts the
// common letters where the least travel reaches them, and that is a claim about
// distances rather than about how the rows look written out.

import { describe, it, expect } from 'vitest'
import {
  BY_FREQUENCY,
  COLUMNS,
  LETTER_LAYOUT,
  ROWS,
  SYMBOL_LAYOUT,
  afterTyping,
  frequencyLayout,
  nextShift,
  shifted,
} from '../../src/core/keys'

/** How far a key sits from the middle of the board. */
const distanceOf = (key: string) => {
  for (let row = 0; row < ROWS; row++) {
    const column = LETTER_LAYOUT[row].indexOf(key)
    if (column >= 0) return Math.hypot(row - (ROWS - 1) / 2, column - (COLUMNS - 1) / 2)
  }
  throw new Error(`${key} is not on the board`)
}

describe('the letter layout', () => {
  it('has every letter, once', () => {
    const keys = LETTER_LAYOUT.flat()
    expect(keys).toHaveLength(ROWS * COLUMNS)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of BY_FREQUENCY) expect(keys).toContain(key)
  })

  it('leaves no cell empty', () => {
    expect(LETTER_LAYOUT.flat().filter(k => k === '')).toEqual([])
  })

  /**
   * The whole reason for the layout. A gaze pointer pays for distance in a way
   * a finger does not, so a commoner letter must never sit further out than a
   * rarer one.
   */
  it('never puts a commoner letter further out than a rarer one', () => {
    const wrong: string[] = []
    for (let i = 1; i < BY_FREQUENCY.length; i++) {
      const nearer = BY_FREQUENCY[i - 1]
      const further = BY_FREQUENCY[i]
      if (distanceOf(nearer) > distanceOf(further)) wrong.push(`${nearer} is further out than ${further}`)
    }
    expect(wrong).toEqual([])
  })

  it('puts the commonest letter in the middle', () => {
    expect(LETTER_LAYOUT[1][4]).toBe('e')
  })

  it('puts the rarest letters in the corners', () => {
    const corners = [LETTER_LAYOUT[0][0], LETTER_LAYOUT[0][8], LETTER_LAYOUT[2][0], LETTER_LAYOUT[2][8]]
    const rarest = BY_FREQUENCY.slice(-4)
    expect([...corners].sort()).toEqual([...rarest].sort())
  })

  // Two keyboards that disagree about where a letter is are two keyboards.
  it('is the same arrangement every time it is worked out', () => {
    expect(frequencyLayout()).toEqual(LETTER_LAYOUT)
    expect(frequencyLayout()).toEqual(frequencyLayout())
  })

  it('lays out whatever it is given, so the rule can be checked on its own', () => {
    const grid = frequencyLayout(['a', 'b', 'c'])
    // Middle first, then out along the middle row — ties are broken towards
    // that row and then leftwards, so this is one fixed answer rather than one
    // of several that happen to satisfy the distances.
    expect(grid[1][4]).toBe('a')
    expect(grid[1][3]).toBe('b')
    expect(grid[1][5]).toBe('c')
    expect(grid.flat().filter(Boolean)).toHaveLength(3)
  })
})

describe('the symbol layer', () => {
  /**
   * Deliberately *not* frequency-ordered. A number is read and typed as a
   * sequence, so the digits have to be where anybody would look for them — the
   * argument for scattering letters does not carry over to something that is
   * already an order.
   */
  it('keeps the digits in the order everybody knows', () => {
    expect(SYMBOL_LAYOUT[0]).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(SYMBOL_LAYOUT[1][0]).toBe('0')
  })

  it('is the same shape as the letters, so nothing moves under the pointer', () => {
    expect(SYMBOL_LAYOUT).toHaveLength(ROWS)
    for (const row of SYMBOL_LAYOUT) expect(row).toHaveLength(COLUMNS)
  })

  /**
   * Nothing on this layer has a capital form, which is what lets the keyboard
   * put every key through `shifted` without a special case. Add a letter here
   * and shift would start capitalising it.
   */
  it('holds nothing that shift could change', () => {
    const shiftable = SYMBOL_LAYOUT.flat().filter(key => key !== key.toUpperCase())
    expect(shiftable).toEqual([])
  })

  it('carries the punctuation a spoken sentence needs', () => {
    const keys = SYMBOL_LAYOUT.flat()
    for (const key of ['.', ',', '?', '!']) expect(keys).toContain(key)
  })
})

/**
 * Shift is a ring, the way the modes on the message box are. Two states would
 * leave no way to type a run of capitals; a separate lock key would be a second
 * target where there is room for one.
 */
describe('shift', () => {
  it('goes off, once, locked, and back', () => {
    expect(nextShift('off')).toBe('once')
    expect(nextShift('once')).toBe('lock')
    expect(nextShift('lock')).toBe('off')
  })

  it('capitalises while it is on', () => {
    expect(shifted('e', 'off')).toBe('e')
    expect(shifted('e', 'once')).toBe('E')
    expect(shifted('e', 'lock')).toBe('E')
  })

  it('spends itself on one letter, unless it is locked', () => {
    expect(afterTyping('once')).toBe('off')
    expect(afterTyping('lock')).toBe('lock')
    expect(afterTyping('off')).toBe('off')
  })
})
