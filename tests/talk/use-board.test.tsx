// The board hook on its own, for the one rule the app tests cannot reach: what
// arrives from another device is not held to the rule an import is.

import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBoard } from '../../src/talk/use-board'
import { EMPTY_ALIASES } from '../../src/core/phrases'
import { emptyStore } from '../../src/core/store'

const withEmpty = {
  ...emptyStore(),
  custom: [{ id: 'custom-1', text: 'Tea please', category: 'Drinks' }],
  categories: ['Drinks', 'Made a moment ago'],
  categoryOrder: ['Made a moment ago', 'Drinks'],
}

describe('a board landing on this one', () => {
  // A category made on another device a moment ago, and not yet filled, is
  // theirs to fill — synchronizing must not take it away from under them.
  it('keeps an empty category another device sends', () => {
    const { result } = renderHook(() => useBoard())
    act(() => result.current.restore(withEmpty, EMPTY_ALIASES))
    expect(result.current.store.categories).toEqual(['Drinks', 'Made a moment ago'])
  })

  it('drops every empty category from an import', () => {
    const { result } = renderHook(() => useBoard())
    act(() => result.current.restore(withEmpty, EMPTY_ALIASES, true))
    expect(result.current.store.categories).toEqual(['Drinks'])
    expect(result.current.store.categoryOrder).toEqual(['Drinks'])
    expect(result.current.allCategories).not.toContain('Made a moment ago')
  })

  it('keeps Library while anything Peri ships is showing', () => {
    const { result } = renderHook(() => useBoard())
    act(() => result.current.restore({ ...withEmpty, categoryOrder: ['Library'] }, EMPTY_ALIASES, true))
    expect(result.current.store.categoryOrder).toEqual(['Library'])
  })
})
