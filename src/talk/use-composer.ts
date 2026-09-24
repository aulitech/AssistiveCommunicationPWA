// The message being built, and everything that acts on it.
//
// The caret matters more here than in an ordinary text box: it decides which
// word the grid filters on, and it is where a chosen phrase lands. A dwell user
// cannot place it by clicking, so the app moves it deliberately and tracks where
// it went.

import { useCallback, useMemo, useRef, useState } from 'react'
import { BLANK } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { speak, type SpeakOptions } from '../voice/speech'

export function useComposer({
  onTranslated,
}: {
  /**
   * Told what came out, when the message came out in another language.
   *
   * A composed message is the one thing said here that is nowhere on the board,
   * so it is also the one whose translation would otherwise exist for exactly as
   * long as it took to say — see `use-translated.ts`.
   */
  onTranslated?: SpeakOptions['onTranslated']
} = {}) {
  const { settings } = useSettings()
  const [text, setTextState] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Where the caret sits right after a phrase was put in the box, **while
   * nothing has been typed since** — null otherwise.
   *
   * A phrase is finished; a word somebody is typing is not, and the two look
   * the same to anything that reads only the text. The caret left against a
   * phrase's last word was read as a word being typed: the board narrowed to
   * it and took the category bar away, and the next phrase chosen replaced it
   * as if finishing it — "Once in a blue moon" and then "Moonlight becomes you"
   * came out as "Once in a blue Moonlight becomes you". Building a sentence
   * out of more than one category, which is what composing is for, could not
   * be done without typing a space first.
   */
  const [afterPhrase, setAfterPhrase] = useState<number | null>(null)

  /**
   * Text the person wrote themselves — typed, pasted, or from Peri's own keys.
   * Whatever it is, it is not a phrase just chosen any more.
   */
  const setText = useCallback((next: string) => {
    setTextState(next)
    setAfterPhrase(null)
  }, [])

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
    // Against the end of a phrase just chosen there is no word being typed.
    if (cursorPos === afterPhrase) return ''
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos, afterPhrase])

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
      // The word being finished is replaced — unless the caret is against the
      // end of a phrase, which is not a word being typed but a phrase that
      // ended there, and is kept whole.
      const stripped = pos === afterPhrase ? before : before.replace(/\S+$/, '')
      const separator = stripped.length > 0 && !stripped.endsWith(' ') ? ' ' : ''
      const inserted = stripped + separator + phraseText
      const newText = inserted + (after.startsWith(' ') || after === '' ? '' : ' ') + after

      setHistory(h => [...h, text])
      setTextState(newText)

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
        // In a blank, a word is exactly what comes next.
        setAfterPhrase(at >= 0 ? null : inserted.length)
      }, 0)
    },
    [text, afterPhrase],
  )

  /**
   * Put something in the box that the user did not type.
   *
   * The one caller is a suggested reply — see `listen/suggest.ts` — and what
   * makes that safe is not here: **the control refuses to run at all while the
   * box has something in it**, because this box's undo is a one-step toggle
   * rather than a stack and could not walk back past a suggestion. So this is
   * `setText` with the caret put at the end, and it is a named thing only so
   * that the one rule about it has somewhere to live. **It never speaks**,
   * whatever mode the board is in.
   */
  const propose = useCallback((suggestion: string, blankAt = -1) => {
    setTextState(suggestion)
    // Into the first gap where there is one, so the fact the model was not told
    // is typed straight into the hole it left — the same landing a
    // fill-in-the-blank phrase gets. The end of the text otherwise.
    const at = blankAt >= 0 ? blankAt : suggestion.length
    setCursorPos(at)
    // An answer is a whole one, like a phrase: nothing at its end is being typed.
    setAfterPhrase(blankAt >= 0 ? null : at)
    const el = textareaRef.current
    // After the render that wrote the text, or the box is still holding the old
    // value and the caret lands in the middle of it.
    setTimeout(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    }, 0)
  }, [])

  const clearOrUndo = useCallback(() => {
    if (text) {
      setHistory(h => [...h, text])
      setTextState('')
    } else if (history.length) {
      setTextState(history[history.length - 1])
      setHistory(h => h.slice(0, -1))
    }
    setAfterPhrase(null)
  }, [text, history])

  /** Resolves to whether the clipboard took it, which is worth saying out loud. */
  const copy = useCallback(() => {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false)
  }, [text])

  const speakIt = useCallback(() => speak(text, settings, { onTranslated }), [text, settings, onTranslated])

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
    propose,
    clearOrUndo,
    copy,
    speak: speakIt,
  }
}

export type Composer = ReturnType<typeof useComposer>
