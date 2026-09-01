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

import { useCallback, useMemo, useState } from 'react'
import { cancelAllDwells } from '../ui/dwell'
import { type Phrase } from '../core/phrases'
import { SENT_CATEGORY } from './use-sent'

/** What the editor is pointed at. Null is a phrase being written from nothing. */
interface Target {
  phrase: Phrase | null
  isEmergency: boolean
}

/** Only what has been changed, so everything else follows the phrase itself. */
interface Edits {
  text?: string
  category?: string
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
  category: string
  /** Empty means the voice everything else is said in. */
  voice: string
  /**
   * A message already said. Saving keeps it as a phrase of the user's own;
   * deleting forgets having said it. Neither edits the record itself.
   */
  keeping: boolean
  isNew: boolean
  canSave: boolean
  /**
   * The board already holds these words in this category. A second copy is
   * nothing but a cell somebody has to read past to reach the one they meant,
   * so it cannot be saved — and the strip says so, since a control that has
   * gone quiet explains nothing by itself.
   */
  duplicate: boolean
}

export function useEditor({
  allCategories,
  recent,
  voiceFor,
  duplicateOf,
}: {
  allCategories: string[]
  /** Where a new phrase starts from: the last category and voice used. */
  recent: { category?: string; voice?: string }
  voiceFor: (id: string) => string | undefined
  /** Whether the board already holds this wording under this category. */
  duplicateOf: (text: string, category: string, exceptId?: string) => string | undefined
}) {
  const [target, setTarget] = useState<Target | null>(null)
  const [edits, setEdits] = useState<Edits>({})

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
    setTarget({ phrase, isEmergency })
    setEdits({})
  }, [])

  /** A blank draft, or one seeded with what was in the message box. */
  const startNew = useCallback((text = '') => {
    setTarget(null)
    setEdits(text ? { text } : {})
  }, [])

  const setText = useCallback((text: string) => setEdits(e => ({ ...e, text })), [])
  const setCategory = useCallback((category: string) => setEdits(e => ({ ...e, category })), [])
  const setVoice = useCallback((voice: string) => setEdits(e => ({ ...e, voice })), [])

  const draft = useMemo<Draft>(() => {
    const phrase = target?.phrase ?? null
    const isEmergency = target?.isEmergency ?? false

    // A phrase whose category is not one of the real ones — a sent message — has
    // to land somewhere the user actually keeps things, and the likeliest
    // somewhere is wherever the last one went.
    const filedUnder = () => {
      if (phrase && allCategories.includes(phrase.category)) return phrase.category
      if (recent.category && allCategories.includes(recent.category)) return recent.category
      return allCategories[0] ?? ''
    }

    const text = edits.text ?? phrase?.source ?? ''
    const category = edits.category ?? filedUnder()
    // Against the category it would be filed under, which for an emergency
    // phrase is the bar rather than whatever the picker last showed.
    const duplicate =
      text.trim() !== '' && duplicateOf(text, isEmergency ? 'Emergency' : category, phrase?.id) !== undefined
    return {
      phrase,
      isEmergency,
      text,
      category,
      voice: edits.voice ?? (phrase ? (voiceFor(phrase.id) ?? '') : (recent.voice ?? '')),
      keeping: phrase?.category === SENT_CATEGORY,
      isNew: phrase === null,
      duplicate,
      // A phrase has to be filed somewhere; the emergency bar is the somewhere
      // for the ones on it.
      canSave: text.trim().length > 0 && (isEmergency || category.trim().length > 0) && !duplicate,
    }
  }, [target, edits, allCategories, recent, voiceFor, duplicateOf])

  /** Whether anything would be lost by starting again. */
  const isUntouched = target === null && !edits.text && !edits.category && !edits.voice

  return { draft, isUntouched, open, startNew, setText, setCategory, setVoice }
}

export type Editor = ReturnType<typeof useEditor>
