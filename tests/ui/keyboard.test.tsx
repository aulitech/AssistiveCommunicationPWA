// The keyboard, driven the only way it will ever be driven: by dwell.
//
// It exists because on a device where the pointer only hovers there is no other
// keyboard at all — iOS raises its own on a gesture and presses its keys with
// taps, and a hovering pointer has neither. So every one of these is a dwell,
// never a click, and what is being tested is that a letter gets from a rested
// pointer into a controlled React field.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Keyboard } from '../../src/ui/keyboard'
import { DEFAULT_SETTINGS } from '../../src/core/store'

const DWELL = DEFAULT_SETTINGS.actionDwellMs

function Harness({ onClose = () => {}, initial = '' }: { onClose?: () => void; initial?: string }) {
  const [value, setValue] = useState(initial)
  // No provider: the settings context defaults to `DEFAULT_SETTINGS`, which is
  // what the dwell times below are read from.
  return (
    <>
      <textarea aria-label="box" value={value} onChange={e => setValue(e.target.value)} />
      <Keyboard onClose={onClose} />
    </>
  )
}

const box = () => screen.getByLabelText<HTMLTextAreaElement>('box')
const key = (name: string) => screen.getByRole('button', { name })

/** Rest on a key until it fires, then leave — the only gesture there is. */
function press(name: string, holdMs = DWELL) {
  const el = key(name)
  fireEvent.pointerEnter(el)
  act(() => void vi.advanceTimersByTime(holdMs))
  fireEvent.pointerLeave(el)
}

const typeInBox = (initial = '') => {
  render(<Harness initial={initial} />)
  act(() => box().focus())
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('typing by dwell', () => {
  it('puts a letter in the box', () => {
    typeInBox()
    press('e')
    expect(box().value).toBe('e')
  })

  it('spells a word out', () => {
    typeInBox()
    for (const letter of ['h', 'i']) press(letter)
    expect(box().value).toBe('hi')
  })

  it('does nothing at all before the dwell is up', () => {
    typeInBox()
    fireEvent.pointerEnter(key('e'))
    act(() => void vi.advanceTimersByTime(DWELL - 50))
    expect(box().value, 'a key fired on a glance rather than a rest').toBe('')
  })

  it('types a space', () => {
    typeInBox('hi')
    box().setSelectionRange(2, 2)
    press('Space')
    expect(box().value).toBe('hi ')
  })

  it('types a new line', () => {
    typeInBox('one')
    box().setSelectionRange(3, 3)
    press('New line')
    expect(box().value).toBe('one\n')
  })

  it('takes a letter back', () => {
    typeInBox('hit')
    box().setSelectionRange(3, 3)
    press('Backspace')
    expect(box().value).toBe('hi')
  })

  /**
   * Backspace repeats while it is held, like every other repeating control —
   * a dwell user clearing a sentence one dwell per letter would be there all
   * day.
   */
  it('keeps taking letters back while it is held', () => {
    typeInBox('hello')
    box().setSelectionRange(5, 5)
    const el = key('Backspace')
    fireEvent.pointerEnter(el)
    act(() => void vi.advanceTimersByTime(DWELL + DEFAULT_SETTINGS.repeatDelayMs * 2))
    fireEvent.pointerLeave(el)
    expect(box().value.length).toBeLessThan(4)
  })

  it('goes in at the caret rather than at the end', () => {
    typeInBox('ac')
    box().setSelectionRange(1, 1)
    press('b')
    expect(box().value).toBe('abc')
  })
})

/**
 * Shift is a ring: one dwell arms it for a letter, a second locks it, a third
 * puts it away. Two states would leave no way to type a run of capitals, and a
 * separate lock key would be a second target where there is room for one.
 */
describe('shift', () => {
  it('capitalises one letter and then lets go', () => {
    typeInBox()
    press('Shift, off')
    press('E')
    press('t')
    expect(box().value).toBe('Et')
  })

  it('locks on a second dwell and stays', () => {
    typeInBox()
    press('Shift, off')
    press('Shift')
    press('E')
    press('T')
    expect(box().value).toBe('ET')
  })

  it('comes off on a third', () => {
    typeInBox()
    press('Shift, off')
    press('Shift')
    press('Capitals locked')
    press('e')
    expect(box().value).toBe('e')
  })

  it('shows on the keys themselves, before anything is typed', () => {
    typeInBox()
    expect(screen.queryByRole('button', { name: 'E' })).toBeNull()
    press('Shift, off')
    expect(screen.getByRole('button', { name: 'E' })).toBeTruthy()
  })
})

describe('the symbol layer', () => {
  it('swaps the letters for digits and back', () => {
    typeInBox()
    expect(screen.queryByRole('button', { name: '4' })).toBeNull()

    press('Numbers and punctuation')
    expect(screen.getByRole('button', { name: '4' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'e' })).toBeNull()

    press('Letters')
    expect(screen.getByRole('button', { name: 'e' })).toBeTruthy()
  })

  it('types a digit', () => {
    typeInBox()
    press('Numbers and punctuation')
    press('7')
    expect(box().value).toBe('7')
  })

  /**
   * Shift and backspace flank the short row in both layers so neither moves
   * when the layer does — but on the symbol layer shift has nothing to do, so
   * it is a gap rather than a key that answers to nothing. A dead target is
   * only slightly better than a wrong one.
   */
  it('leaves a gap where shift would be, rather than a key that does nothing', () => {
    typeInBox()
    press('Numbers and punctuation')
    expect(screen.queryByRole('button', { name: /^Shift/ })).toBeNull()
    expect(document.querySelector('.key-gap')).not.toBeNull()
    // Backspace has not moved with it.
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeTruthy()
  })

  // Symbols are what they are: shift must not turn a full stop into anything.
  it('leaves the symbols alone while shift is on', () => {
    typeInBox()
    press('Shift, off')
    press('Numbers and punctuation')
    press('.')
    expect(box().value).toBe('.')
  })
})

describe('the keyboard itself', () => {
  it('closes when asked', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    press('Close the keyboard')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  /**
   * With nowhere to type, a key does nothing rather than throwing. The board is
   * reachable with the keyboard up, so a pointer can arrive on a letter with no
   * field focused at all.
   */
  it('does nothing when there is nowhere to type', () => {
    render(<Harness />)
    expect(() => press('e')).not.toThrow()
    expect(box().value).toBe('')
  })

  it('offers every letter of the alphabet', () => {
    render(<Harness />)
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      expect(screen.getByRole('button', { name: letter }), `${letter} is missing`).toBeTruthy()
    }
  })
})
