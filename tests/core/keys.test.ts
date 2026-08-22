// The keys, and the shape they hold.
//
// A frequency layout came first — commonest letters nearest the middle, which
// is genuinely less travel, and travel is what a gaze pointer pays for. It lost
// to the fact that nobody has ever seen one: every letter has to be hunted for
// until it is learnt, on a board somebody is trying to hold a conversation
// with. So what is tested here is that the arrangement really is the familiar
// one, and that the two layers keep the same shape as each other.

import { describe, it, expect } from 'vitest'
import { LETTER_ROWS, SYMBOL_ROWS, afterTyping, nextShift, shifted } from '../../src/core/keys'

describe('the letters', () => {
  it('are the three rows everybody already knows', () => {
    expect(LETTER_ROWS[0].join('')).toBe('qwertyuiop')
    expect(LETTER_ROWS[1].join('')).toBe("asdfghjkl'")
    expect(LETTER_ROWS[2].join('')).toBe('zxcvbnm')
  })

  it('has every letter of the alphabet, once', () => {
    const letters = LETTER_ROWS.flat().filter(k => /[a-z]/.test(k))
    expect(letters).toHaveLength(26)
    expect(new Set(letters).size).toBe(26)
  })

  /**
   * The apostrophe is on the letter layer rather than behind `?123`, where iOS
   * keeps it. It is in "I'm", "don't", "it's" and "that's" — most of what
   * anybody says out loud — and a layer switch either side would cost two
   * dwells every time.
   */
  it('keeps the apostrophe out of the layer switch', () => {
    expect(LETTER_ROWS.flat()).toContain("'")
  })
})

describe('the symbol layer', () => {
  it('keeps the digits in the order everybody knows', () => {
    expect(SYMBOL_ROWS[0].join('')).toBe('1234567890')
  })

  /**
   * Nothing here has a capital form, which is what lets the keyboard put every
   * key through `shifted` without a special case. Add a letter and shift would
   * start capitalising it.
   */
  it('holds nothing that shift could change', () => {
    expect(SYMBOL_ROWS.flat().filter(key => key !== key.toUpperCase())).toEqual([])
  })

  it('carries the punctuation a spoken sentence needs', () => {
    const keys = SYMBOL_ROWS.flat()
    for (const key of ['.', ',', '?', '!']) expect(keys).toContain(key)
  })

  /**
   * The structural claim, and the reason the two are written as rows rather
   * than as one grid: switching layers must move nothing. Shift and backspace
   * flank the short row in both, so a pointer that has learnt where backspace
   * is finds it in the same place either way.
   */
  it('is the same shape as the letters, so nothing moves under the pointer', () => {
    expect(SYMBOL_ROWS.map(r => r.length)).toEqual(LETTER_ROWS.map(r => r.length))
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
