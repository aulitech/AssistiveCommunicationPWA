// **Undo and Redo** for what is done to the board — a phrase saved, a phrase
// deleted or taken out of a category, a category deleted. See
// docs/decisions/undo-and-redo.md.
//
// Out of `talk.tsx`, whose saves and deletes say what they did (`record`) and
// whose Undo and Redo put the board back (`undo`, `redo`); the counts and the
// hidden tabs a change took with it are the screen's, so it is handed the
// change and does those itself.

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyDelta, diffStore, isEmptyDelta, recorded, type Change, type History } from '../core/history'
import { loadHistory, saveHistory, type PhraseStore } from '../core/store'

/** What a change was about, said before the difference it made is known. */
export type Recording = Omit<Change, 'forward' | 'back'>

export function useHistory(store: PhraseStore, replaceStore: (next: PhraseStore) => void) {
  const [history, setHistory] = useState<History>(loadHistory)
  const keep = useCallback((next: History) => {
    saveHistory(next)
    setHistory(next)
  }, [])

  // The board as the screen last drew it — the one a save or a delete is about
  // to change. Read when the change is said, so `record` stays stable.
  const drawn = useRef(store)
  /**
   * **A change said and not yet made.** Saving and deleting write the board
   * through state, which lands in the next render — so the difference is taken
   * there, against the board as it was drawn when the change was said.
   */
  const pending = useRef<{ before: PhraseStore; recording: Recording } | null>(null)
  useEffect(() => {
    const said = pending.current
    if (!said || said.before === store) return
    pending.current = null
    const forward = diffStore(said.before, store)
    if (isEmptyDelta(forward)) return
    setHistory(h => {
      const next = recorded(h, { ...said.recording, forward, back: diffStore(store, said.before) })
      saveHistory(next)
      return next
    })
  }, [store])
  // After every render, and after the one above: a change that came to nothing
  // is let go here rather than left to be pinned on whatever changes the board
  // next — a message said, a board from another device.
  useEffect(() => {
    drawn.current = store
    pending.current = null
  })

  /**
   * Says what the change being made is. Called with the change itself, in the
   * same dwell — before or after the board's own calls, which change nothing
   * until the next render.
   */
  const record = useCallback((recording: Recording) => {
    pending.current = { before: drawn.current, recording }
  }, [])

  /** Takes back the last change, and hands it back with the board it left. */
  const undo = useCallback(() => {
    const change = history.undo.at(-1)
    if (!change) return null
    pending.current = null
    const next = applyDelta(store, change.back)
    replaceStore(next)
    keep({ undo: history.undo.slice(0, -1), redo: [...history.redo, change] })
    return { change, next }
  }, [history, store, replaceStore, keep])

  /** Makes again the last change taken back. */
  const redo = useCallback(() => {
    const change = history.redo.at(-1)
    if (!change) return null
    pending.current = null
    const next = applyDelta(store, change.forward)
    replaceStore(next)
    keep({ undo: [...history.undo, change], redo: history.redo.slice(0, -1) })
    return { change, next }
  }, [history, store, replaceStore, keep])

  return {
    /** What Undo would take back, or nothing. */
    toUndo: history.undo.at(-1)?.what,
    /** What Redo would make again, or nothing. */
    toRedo: history.redo.at(-1)?.what,
    record,
    undo,
    redo,
  }
}
