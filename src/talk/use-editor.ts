// The phrase being written or reworded.
//
// There was a dialog for this until now, and a dialog is the wrong shape for a
// board driven by gaze: it covers the phrases being edited, it has to be got out
// of before anything else can be reached, and every one of its controls is a
// target somewhere the pointer has never been. So in edit mode the message box
// *is* the phrase editor — there is always a draft, and choosing a phrase on the
// board points the draft at it rather than opening anything.
//
// Only the fields the user actually touched are kept here. The rest are derived
// from the phrase each render, so a draft cannot go stale against a store that
// changed underneath it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cancelAllDwells, holdDwellsUntilMoved } from '../ui/dwell'
import { LIBRARY, type Phrase } from '../core/phrases'
import { TRANSLATED_CATEGORY } from './use-translated'
import { SUGGEST_CATEGORY } from './suggestions'
import { keepPhrased, typedIn } from './typed'

/** Neither is a category on the board, so a phrase off one is kept rather than edited. */
const keepingOf = (phrase: Phrase | null) =>
  phrase?.category === TRANSLATED_CATEGORY || phrase?.category === SUGGEST_CATEGORY

/** What the editor is pointed at. Null is a phrase being written from nothing. */
interface Target {
  phrase: Phrase | null
  isEmergency: boolean
}

/** Only what has been changed, so everything else follows the phrase itself. */
interface Edits {
  text?: string
  categories?: string[]
  voice?: string
}

export interface Draft {
  /** The phrase being reworded, or null for one being written. */
  phrase: Phrase | null
  isEmergency: boolean
  /**
   * The source, not the display text. `text` has had its slots resolved into
   * labels — "red/blue" — and saving that back flattens the slot for good.
   */
  text: string
  /**
   * The categories that will refer to it. **It is in Library whatever this
   * says** — every phrase is — so an empty list is a phrase in Library alone.
   */
  categories: string[]
  /** Empty means the voice everything else is said in. */
  voice: string
  /**
   * A record of something already said, or offered — a translation, or an answer.
   * Saving keeps what is in the box as a phrase of the user's own; deleting
   * forgets having said it. Neither edits the record itself.
   *
   * **A kept translation is an ordinary phrase.** Its language is not carried
   * over: a phrase on the board is spoken in the language the board is set to,
   * which is the rule the whole app is built on, and a phrase that quietly
   * ignored the setting would be the one exception nobody could see.
   */
  keeping: boolean
  /**
   * Which record it came off, for the labels that have to name it.
   *
   * Null unless `keeping`. Three controls read it — Save, the bin, and the line
   * that says what the strip is for.
   */
  kept: 'translation' | 'answer' | null
  isNew: boolean
  canSave: boolean
  /**
   * Library already holds these words — or the emergency bar does, for one
   * going there. A second copy is nothing but a cell somebody has to read past
   * to reach the one they meant, so it cannot be saved — and the strip says so,
   * since a control that has gone quiet explains nothing by itself.
   */
  duplicate: boolean
}

export function useEditor({
  allCategories,
  recent,
  voiceFor,
  duplicateOf,
  categoriesOf,
}: {
  allCategories: string[]
  /**
   * Where a new phrase starts from: the last voice used, and the category
   * either last filed under or last looked at — `talk.tsx` writes the tab there
   * on the way into edit mode, where that tab is a category of somebody's own.
   */
  recent: { category?: string; voice?: string }
  voiceFor: (id: string) => string | undefined
  /** Whether Library, or the emergency bar, already holds this wording. */
  duplicateOf: (text: string, onBar: boolean, exceptId?: string) => string | undefined
  /** The categories that refer to a phrase already on the board. */
  categoriesOf: (id: string) => string[]
}) {
  const [target, setTarget] = useState<Target | null>(null)
  const [edits, setEdits] = useState<Edits>({})
  /**
   * What the box held when it was loaded — a phrase opened, or a message
   * carried in — and the caret. **What is typed after it searches the board**,
   * by the rule the message box follows (`talk/typed.ts`): a phrase opened is
   * finished, so opening one narrows nothing, and typing does.
   */
  const [phrased, setPhrased] = useState('')
  const [cursor, setCursor] = useState(0)
  /** Whether the grid is narrowed now — read by `open`, which has to stay stable. */
  const narrowing = useRef(false)

  /**
   * Point the editor at a phrase — or, with null, at a new one.
   *
   * Stable across renders on purpose: this sits on the context every one of a
   * couple of thousand memoised phrase cells reads, and a fresh identity each
   * render would leave the memo holding nothing.
   */
  const open = useCallback((phrase: Phrase | null, isEmergency = false) => {
    // Whatever else was part-way through would otherwise land on the phrase that
    // has just been loaded.
    cancelAllDwells()
    // Opening a phrase off a narrowed grid lets the whole tab back, every cell
    // changing under the pointer that chose it — as composing does.
    if (narrowing.current) holdDwellsUntilMoved()
    setTarget({ phrase, isEmergency })
    setEdits({})
    const source = phrase?.source ?? ''
    setPhrased(source)
    setCursor(source.length)
  }, [])

  /**
   * A blank draft, or one seeded with what was in the message box — and of
   * that, `phrased` is what was put there rather than typed, so a word being
   * typed when edit mode came on is still being typed.
   */
  const startNew = useCallback((text = '', phrased = text) => {
    setTarget(null)
    setEdits(text ? { text } : {})
    setPhrased(phrased)
    setCursor(text.length)
  }, [])

  const setText = useCallback((text: string) => {
    setPhrased(was => keepPhrased(was, text))
    setEdits(e => ({ ...e, text }))
  }, [])

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(e.currentTarget.selectionStart ?? 0)
  }, [])
  const setCategories = useCallback((categories: string[]) => setEdits(e => ({ ...e, categories })), [])
  const setVoice = useCallback((voice: string) => setEdits(e => ({ ...e, voice })), [])

  const draft = useMemo<Draft>(() => {
    const phrase = target?.phrase ?? null
    const isEmergency = target?.isEmergency ?? false

    // A phrase on the board is in the categories that refer to it. One being
    // written — or kept off a record, which is in none — starts in the category
    // last filed under or looked at, where that is still one of somebody's own.
    const startsIn = () => {
      if (phrase && !keepingOf(phrase)) return categoriesOf(phrase.id)
      return recent.category && recent.category !== LIBRARY && allCategories.includes(recent.category)
        ? [recent.category]
        : []
    }

    const text = edits.text ?? phrase?.source ?? ''
    const categories = (edits.categories ?? startsIn()).filter(c => allCategories.includes(c) && c !== LIBRARY)
    // Against Library, or the bar for a phrase going there.
    const duplicate = text.trim() !== '' && duplicateOf(text, isEmergency, phrase?.id) !== undefined
    return {
      phrase,
      isEmergency,
      text,
      categories,
      voice: edits.voice ?? (phrase ? (voiceFor(phrase.id) ?? '') : (recent.voice ?? '')),
      // Neither is a category on the board, so what Save does with one
      // is keep it as a new phrase rather than edit the record it came off.
      keeping: keepingOf(phrase),
      kept:
        phrase?.category === TRANSLATED_CATEGORY
          ? 'translation'
          : phrase?.category === SUGGEST_CATEGORY
            ? 'answer'
            : null,
      isNew: phrase === null,
      duplicate,
      // Every phrase is in Library, so there is always somewhere for it to go.
      canSave: text.trim().length > 0 && !duplicate,
    }
  }, [target, edits, allCategories, recent, voiceFor, duplicateOf, categoriesOf])

  /** Whether anything would be lost by starting again. */
  const isUntouched = target === null && !edits.text && !edits.categories && !edits.voice

  /** What has been typed into the draft since it was loaded, which the grid searches for. */
  const typed = typedIn(draft.text, phrased, cursor)
  useEffect(() => {
    narrowing.current = typed !== ''
  }, [typed])

  return {
    draft,
    isUntouched,
    typed,
    phrased,
    cursor,
    open,
    startNew,
    setText,
    setCategories,
    setVoice,
    trackCursor,
    setCursor,
  }
}

export type Editor = ReturnType<typeof useEditor>
