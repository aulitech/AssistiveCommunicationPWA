// The history hook on its own, for what the app tests cannot reach: when a
// change said is pinned on the board, and when it is let go.

import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHistory } from '../../src/talk/use-history'
import { emptyStore, type PhraseStore } from '../../src/core/store'

const tea = { id: 'custom-1', text: 'Tea please', category: 'Library' }

/** The hook over a board held by the test, replaced as Undo and Redo replace it. */
function withBoard(start: PhraseStore) {
  let board = start
  const hook = renderHook(({ store }) => useHistory(store, next => (board = next)), {
    initialProps: { store: start },
  })
  return {
    hook,
    /** The board changing, as the next render shows it. */
    change: (next: PhraseStore) => {
      board = next
      hook.rerender({ store: next })
    },
    board: () => board,
  }
}

describe('the history hook', () => {
  it('pins a change said on the board the next render shows', () => {
    const { hook, change } = withBoard(emptyStore())
    act(() => hook.result.current.record({ what: 'Saved “Tea please”', phrase: tea.id }))
    change({ ...emptyStore(), custom: [tea] })

    expect(hook.result.current.toUndo).toBe('Saved “Tea please”')
  })

  /**
   * Regression guard: a change said that came to nothing — a render with the
   * board as it was — is let go there, rather than pinned on whatever changes
   * the board next: a message said, a board from another device.
   */
  it('lets go of a change that came to nothing', () => {
    const start = emptyStore()
    const { hook, change } = withBoard(start)
    act(() => hook.result.current.record({ what: 'Saved nothing' }))
    hook.rerender({ store: start })
    change({ ...start, custom: [tea] })

    expect(hook.result.current.toUndo).toBeUndefined()
  })

  it('takes back and makes again, on the board it is handed', () => {
    const start = emptyStore()
    const { hook, change, board } = withBoard(start)
    act(() => hook.result.current.record({ what: 'Saved “Tea please”' }))
    change({ ...start, custom: [tea] })

    act(() => void hook.result.current.undo())
    expect(board().custom).toEqual([])
    expect(hook.result.current.toRedo).toBe('Saved “Tea please”')

    change(board())
    act(() => void hook.result.current.redo())
    expect(board().custom).toEqual([tea])
    expect(hook.result.current.toUndo).toBe('Saved “Tea please”')
  })

  it('records nothing for an Undo, which changes the board itself', () => {
    const start = emptyStore()
    const { hook, change, board } = withBoard(start)
    act(() => hook.result.current.record({ what: 'Saved “Tea please”' }))
    change({ ...start, custom: [tea] })
    act(() => void hook.result.current.undo())
    change(board())

    expect(hook.result.current.toUndo).toBeUndefined()
    expect(hook.result.current.toRedo).toBe('Saved “Tea please”')
  })
})
