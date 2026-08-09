// The message being built, and everything that acts on it.
//
// The caret matters more here than in an ordinary text box: it decides which
// word the grid filters on, and it is where a chosen phrase lands. A dwell user
// cannot place it by clicking, so the app moves it deliberately and tracks where
// it went.

import { useCallback, useMemo, useRef, useState } from 'react'
import { BLANK } from './phrases'
import { useSettings } from './settings'
import { speak } from './speech'

export function useComposer() {
  const { settings } = useSettings()
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /** Clear when there is something to clear; otherwise put the last one back. */
  const showUndo = !text && history.length > 0

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? 0)
  }, [])

  /** The partial word left of the cursor, which the grid narrows itself to. */
  const currentWord = useMemo(() => {
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos])

  /** Replace the partial word left of the cursor with `phraseText`. */
  const insert = useCallback(
    (phraseText: string) => {
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

      // Land the cursor on the first unfilled blank if there is one, so it can be
      // typed over; otherwise sit at the end of what was just inserted.
      const blankAt = inserted.indexOf(BLANK, stripped.length)
      setTimeout(() => {
        if (el) {
          if (blankAt >= 0) {
            el.selectionStart = blankAt
            el.selectionEnd = blankAt + BLANK.length
            el.focus()
          } else {
            el.selectionStart = el.selectionEnd = inserted.length
          }
        }
        setCursorPos(blankAt >= 0 ? blankAt : inserted.length)
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

  const focus = useCallback(() => textareaRef.current?.focus(), [])

  return {
    text,
    setText,
    cursorPos,
    currentWord,
    showUndo,
    canClear: Boolean(text) || history.length > 0,
    focused,
    setFocused,
    textareaRef,
    trackCursor,
    insert,
    clearOrUndo,
    copy,
    speak: speakIt,
    focus,
  }
}

export type Composer = ReturnType<typeof useComposer>
