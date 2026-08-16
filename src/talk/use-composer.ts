// The message being built, and everything that acts on it.
//
// The caret matters more here than in an ordinary text box: it decides which
// word the grid filters on, and it is where a chosen phrase lands. A dwell user
// cannot place it by clicking, so the app moves it deliberately and tracks where
// it went.

import { useCallback, useMemo, useRef, useState } from 'react'
import { BLANK } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { speak } from '../voice/speech'

export function useComposer() {
  const { settings } = useSettings()
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /** Clear when there is something to clear; otherwise put the last one back. */
  const showUndo = !text && history.length > 0

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? 0)
  }, [])

  /**
   * The caret was moved by something other than the user's own typing — the
   * dwell that places it under the pointer. Told rather than read back,
   * because the events a box fires for a caret it moved itself are not the
   * ones it fires for a caret moved by `setSelectionRange`.
   */
  const setCursor = useCallback((index: number) => setCursorPos(index), [])

  /** The partial word left of the cursor, which the grid narrows itself to. */
  const currentWord = useMemo(() => {
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos])

  /**
   * Replace the partial word left of the cursor with `phraseText`.
   *
   * `blankAt` is where that phrase's first unfilled blank sits within it, or -1.
   * It has to be handed in rather than searched for: a blank is empty text now,
   * and searching a string for an empty one matches at the first position asked
   * about — which would land the caret at the start of every phrase inserted,
   * blank or not. `composeWithBlank` is what knows.
   */
  const insert = useCallback(
    (phraseText: string, blankAt = -1) => {
      const el = textareaRef.current
      const pos = el?.selectionStart ?? text.length
      const before = text.slice(0, pos)
      const after = text.slice(pos)
      const stripped = before.replace(/\S+$/, '')
      const separator = stripped.length > 0 && !stripped.endsWith(' ') ? ' ' : ''
      const inserted = stripped + separator + phraseText
      const newText = inserted + (after.startsWith(' ') || after === '' ? '' : ' ') + after

      setHistory(h => [...h, text])
      setText(newText)

      // Land the cursor in the first unfilled blank if there is one, so the word
      // can be typed straight into the gap; otherwise sit at the end of what was
      // just inserted.
      const at = blankAt >= 0 ? stripped.length + separator.length + blankAt : -1
      setTimeout(() => {
        if (el) {
          if (at >= 0) {
            el.selectionStart = at
            // Empty selects nothing and simply places the caret, which is the
            // whole of what a blank offers once it has no characters of its own.
            el.selectionEnd = at + BLANK.length
            el.focus()
          } else {
            el.selectionStart = el.selectionEnd = inserted.length
          }
        }
        setCursorPos(at >= 0 ? at : inserted.length)
      }, 0)
    },
    [text],
  )

  const clearOrUndo = useCallback(() => {
    if (text) {
      setHistory(h => [...h, text])
      setText('')
    } else if (history.length) {
      setText(history[history.length - 1])
      setHistory(h => h.slice(0, -1))
    }
  }, [text, history])

  /** Resolves to whether the clipboard took it, which is worth saying out loud. */
  const copy = useCallback(() => {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false)
  }, [text])

  const speakIt = useCallback(() => speak(text, settings), [text, settings])

  return {
    text,
    setText,
    cursorPos,
    currentWord,
    showUndo,
    canClear: Boolean(text) || history.length > 0,
    textareaRef,
    trackCursor,
    setCursor,
    insert,
    clearOrUndo,
    copy,
    speak: speakIt,
  }
}

export type Composer = ReturnType<typeof useComposer>
