// The message being built, and everything that acts on it.
//
// The caret matters more here than in an ordinary text box: it decides what the
// grid searches for, and it is where a chosen phrase lands. A dwell user
// cannot place it by clicking, so the app moves it deliberately and tracks where
// it went.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../ui/settings'
import { speak, type SpeakOptions } from '../voice/speech'
import { keepPhrased, phraseEndIn, typedFrom as typedFromIn } from './typed'

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
  /**
   * What the box held before, for Undo. **With where a phrase in it ended**, or
   * putting a cleared message back would put back a phrase whose words the
   * board then read as typed — and the next phrase chosen would write over it,
   * the very thing `phraseEnd` exists to stop.
   */
  const [history, setHistory] = useState<{ text: string; phrased: string }[]>([])
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Where the last phrase put in the box ended — 0 when none has been. **What
   * is typed after it is what the board searches for**, spaces and all: "i want
   * a dr" finds "I want a drink", and choosing it replaces the whole of what was
   * typed rather than its last word.
   *
   * A phrase is finished; what somebody is typing is not, and the two look the
   * same to anything that reads only the text. The caret left against a
   * phrase's last word was once read as a word being typed: the board narrowed
   * to it and took the category bar away, and the next phrase chosen replaced
   * it as if finishing it — "Once in a blue moon" and then "Moonlight becomes
   * you" came out as "Once in a blue Moonlight becomes you". Everything before
   * this point is left alone.
   *
   * **Kept as the text up to that point**, and the point is how much of it the
   * box still holds. Typed after, it is untouched; changed anywhere before its
   * end, the phrase is not whole any more and the point moves back to the start
   * of the word the change is in — see `setText`.
   */
  const [phrased, setPhrased] = useState('')
  /**
   * What auto-speak last put in the box, and how it was said — the phrase's
   * own voice, and the language it already is where it is not the board's —
   * see `showSaid`. `selecting` counts the times it has been put there, for the
   * effect that selects it.
   */
  const [shown, setShown] = useState<{ text: string; voiceURI?: string; alreadyIn?: string; selecting: number }>({
    text: '',
    selecting: 0,
  })
  const phraseEnd = useMemo(() => phraseEndIn(text, phrased), [text, phrased])

  /**
   * Text the person wrote themselves — typed, pasted, or from Peri's own keys.
   *
   * An edit inside the last phrase unmakes it back to the start of the word
   * the edit is in: taking the last letter off "moon" and typing it back is
   * typing "moon", and the board searches for the whole word.
   */
  const setText = useCallback((next: string) => {
    setPhrased(was => keepPhrased(was, next))
    setTextState(next)
  }, [])

  /**
   * **Words changed somewhere other than the box** — a link's fields — which
   * are not typing: the whole of it is finished, so the board searches for
   * nothing, and the caret goes to the end.
   */
  const rewrite = useCallback((next: string) => {
    setTextState(next)
    setPhrased(next)
    setCursorPos(next.length)
  }, [])

  /** Clear when there is something to clear; otherwise put the last one back. */
  const showUndo = !text && history.length > 0

  // **The end of a selection**, where there is one: a phrase auto-speak said
  // sits in the box selected, and the next phrase chosen once auto-speak is off
  // belongs after it, not before it.
  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionEnd ?? 0)
  }, [])

  /**
   * The caret was moved by something other than the user's own typing — the
   * dwell that places it under the pointer. Told rather than read back,
   * because the events a box fires for a caret it moved itself are not the
   * ones it fires for a caret moved by `setSelectionRange`.
   */
  const setCursor = useCallback((index: number) => setCursorPos(index), [])

  /**
   * Where what is being typed begins, for a caret at `pos`: the end of the last
   * phrase — or, with the caret back inside what came before it, the start of
   * the word it is in, since a caret moved into a phrase's gap is filling a
   * blank one word at a time.
   */
  const typedFrom = useCallback((pos: number) => typedFromIn(text, phraseEnd, pos), [text, phraseEnd])

  /** What has been typed since the last phrase, which the grid searches for. */
  const typed = useMemo(() => {
    const pos = Math.min(cursorPos, text.length)
    return text.slice(typedFrom(pos), pos).trim()
  }, [text, cursorPos, typedFrom])

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
    setPhrased(suggestion)
    const el = textareaRef.current
    // After the render that wrote the text, or the box is still holding the old
    // value and the caret lands in the middle of it.
    setTimeout(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    }, 0)
  }, [])

  /**
   * **What auto-speak has just said, in the box in place of whatever was there,
   * and selected** — so typing writes over it, :copy: copies it, and :speak:
   * says it again. A phrase rather than typing (`phrased`), so the board does
   * not narrow to its words. **What the box held is not kept for Undo**: it
   * was most often what somebody typed to find the phrase, and Undo only ever
   * brings back the last thing cleared, which would be this.
   */
  const showSaid = useCallback((said: string, how: { voiceURI?: string; alreadyIn?: string } = {}) => {
    setTextState(said)
    setPhrased(said)
    setShown(s => ({ text: said, ...how, selecting: s.selecting + 1 }))
    setCursorPos(said.length)
  }, [])

  // Selected in the commit that wrote it, rather than on a timer after it. A
  // dwell fires from a timer, and the render it asks for can come after a
  // timer set beside it — which found the box still holding the old words,
  // and selected nothing. A click happened to render first, which is why it
  // worked one way and not the other.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!shown.selecting || !el || el.value !== shown.text) return
    el.focus()
    el.setSelectionRange(0, shown.text.length)
  }, [shown])

  /**
   * The box holding `next`, with `phrased` what was put there rather than
   * typed and the caret at `caret` — what the edit box held as edit mode is
   * left, so the words, the caret and the word the grid is narrowed to all
   * carry on as they were. What was there goes to Undo.
   */
  const load = useCallback(
    (next: string, nextPhrased: string, caret: number) => {
      if (next === text) return
      if (text) setHistory(h => [...h, { text, phrased }])
      setTextState(next)
      setPhrased(nextPhrased)
      setCursorPos(caret)
      const el = textareaRef.current
      // After the render that wrote the text, or the box is still holding the
      // old value and the caret lands in the middle of it.
      setTimeout(() => el?.setSelectionRange(caret, caret), 0)
    },
    [text, phrased],
  )

  /** Empties the box, keeping what was in it for Undo — as Clear does. */
  const clear = useCallback(() => {
    if (!text) return
    setHistory(h => [...h, { text, phrased }])
    setTextState('')
    setPhrased('')
  }, [text, phrased])

  const clearOrUndo = useCallback(() => {
    if (text) {
      clear()
    } else if (history.length) {
      const last = history[history.length - 1]
      setTextState(last.text)
      setPhrased(last.phrased)
      setHistory(h => h.slice(0, -1))
    }
  }, [text, history, clear])

  /** Resolves to whether the clipboard took it, which is worth saying out loud. */
  const copy = useCallback(() => {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false)
  }, [text])

  /** The box holds only what auto-speak just said, untouched. */
  const holdsSaid = text !== '' && text === shown.text

  /**
   * Said as the phrase was, while the box holds it untouched: in its own voice,
   * and in the language it already is — a cell off Translations is not sent to
   * be translated a second time, nor kept a second time.
   */
  const speakIt = useCallback(
    (words: string = text) =>
      holdsSaid
        ? speak(words, settings, {
            voiceURI: shown.voiceURI,
            alreadyIn: shown.alreadyIn,
            onTranslated,
            please: settings.please,
          })
        : speak(words, settings, { onTranslated, please: settings.please }),
    [text, settings, onTranslated, holdsSaid, shown],
  )

  return {
    text,
    setText,
    rewrite,
    cursorPos,
    typed,
    showUndo,
    canClear: Boolean(text) || history.length > 0,
    /**
     * The box holds only what auto-speak just said, untouched — something said
     * already rather than a message being written, so it does not count as one
     * where a half-written message would hold something back.
     */
    holdsSaid,
    /** The language what the box holds already is, while it holds a phrase said from Translations. */
    saidIn: holdsSaid ? shown.alreadyIn : undefined,
    textareaRef,
    trackCursor,
    setCursor,
    propose,
    showSaid,
    load,
    clear,
    clearOrUndo,
    copy,
    speak: speakIt,
  }
}

export type Composer = ReturnType<typeof useComposer>
