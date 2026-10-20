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
import { mayTakeCaret } from '../ui/typing'
import { LIBRARY, type Phrase } from '../core/phrases'
import { TRANSLATED_CATEGORY } from './use-translated'
import { SUGGEST_CATEGORY } from './suggestions'
import { insertAt, keepPhrased, typedIn } from './typed'

/** A blank to type into, as a phrase's source writes it. */
const BLANK_IN_SOURCE = /\{\s*\}/

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
   * going there. **A second copy is never made**: it is nothing but a cell
   * somebody has to read past to reach the one they meant.
   */
  duplicate: boolean
  /**
   * The phrase that has these words already, where Save puts *it* in the
   * category showing instead — `into`, which it is not in yet. Unset where
   * there is nothing for Save to do with it, which the strip says.
   */
  sameAs?: string
  /** The category whose tab is showing, which Save files into — or null on Library or a record. */
  into: string | null
}

export function useEditor({
  allCategories,
  tab,
  recent,
  voiceFor,
  duplicateOf,
  categoriesOf,
  box,
}: {
  allCategories: string[]
  /** The tab showing, which is where a new phrase goes where it is a category. */
  tab: string
  /** The voice a new phrase starts from: the last one used. */
  recent: { voice?: string }
  voiceFor: (id: string) => string | undefined
  /** Whether Library, or the emergency bar, already holds this wording. */
  duplicateOf: (text: string, onBar: boolean, exceptId?: string) => string | undefined
  /** The categories that refer to a phrase already on the board. */
  categoriesOf: (id: string) => string[]
  /** The box the draft is written in, for the caret a phrase put in it leaves. */
  box: React.RefObject<HTMLTextAreaElement | null>
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

  /** Words changed somewhere other than the box — not typing; see the composer's `rewrite`. */
  const rewrite = useCallback((text: string) => {
    setEdits(e => ({ ...e, text }))
    setPhrased(text)
    setCursor(text.length)
  }, [])

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(e.currentTarget.selectionStart ?? 0)
  }, [])
  const setVoice = useCallback((voice: string) => setEdits(e => ({ ...e, voice })), [])

  const draft = useMemo<Draft>(() => {
    const phrase = target?.phrase ?? null
    const isEmergency = target?.isEmergency ?? false

    // **Saved into the category whose tab is showing**, as the tab is when Save
    // is pressed — or into Library alone, where the tab is Library or a record.
    // There is nothing else to choose it by: the tab is where somebody is
    // looking. A phrase already on the board keeps the categories it is in and
    // goes into this one as well; one on the emergency bar has none.
    const into = !isEmergency && tab !== LIBRARY && allCategories.includes(tab) ? tab : null
    const startsIn = () => {
      const own = phrase && !keepingOf(phrase) ? categoriesOf(phrase.id) : []
      return into && !own.includes(into) ? [...own, into] : own
    }

    const text = edits.text ?? phrase?.source ?? ''
    const categories = startsIn().filter(c => allCategories.includes(c) && c !== LIBRARY)
    // Against Library, or the bar for a phrase going there.
    const existing = text.trim() !== '' ? duplicateOf(text, isEmergency, phrase?.id) : undefined
    const duplicate = existing !== undefined
    // The words are on the board: Save files that phrase here, where it is not yet.
    const sameAs = existing !== undefined && into && !categoriesOf(existing).includes(into) ? existing : undefined
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
      sameAs,
      into,
      // Every phrase is in Library, so there is always somewhere for it to go.
      canSave: text.trim().length > 0 && (!duplicate || sameAs !== undefined),
    }
  }, [target, edits, allCategories, tab, recent, voiceFor, duplicateOf, categoriesOf])

  /** Whether anything would be lost by starting again. */
  const isUntouched = target === null && !edits.text && !edits.voice

  /** What has been typed into the draft since it was loaded, which the grid searches for. */
  const typed = typedIn(draft.text, phrased, cursor)
  useEffect(() => {
    narrowing.current = typed !== ''
  }, [typed])

  /** The draft as it stands, for `choose`, which has to stay stable as `open` does. */
  const live = useRef({ text: '', phrased: '', cursor: 0 })
  useEffect(() => {
    live.current = { text: draft.text, phrased, cursor }
  }, [draft.text, phrased, cursor])

  /**
   * **A phrase chosen in edit mode**: into an empty box it opens, to be reworded
   * or deleted; into one with words in it, it goes in at the caret, as edit
   * mode shows it — choices and all — and what the box holds is the phrase
   * being written. So a sentence is built out of phrases here, now that edit
   * mode is the only place one is.
   *
   * Stable for the reason `open` is.
   */
  const choose = useCallback(
    (phrase: Phrase | null, isEmergency = false) => {
      const { text, phrased: was, cursor: at } = live.current
      // **Choosing changes the box under the pointer that chose**, opened or
      // put in — it can grow and push the grid down, and a search it ends lets
      // the whole tab back — so nothing may be chosen until the gaze moves, as
      // nothing could when choosing built a message outside edit mode.
      if (phrase) holdDwellsUntilMoved()
      if (!phrase || !text.trim()) {
        open(phrase, isEmergency)
        return 'opened' as const
      }
      cancelAllDwells()
      const next = insertAt(text, was, at, phrase.source)
      // **A blank is selected**, so the word typed next is the one that fills
      // it — the gap a phrase leaves to be typed into, as edit mode shows it.
      const gap = phrase.source.match(BLANK_IN_SOURCE)
      const from = gap ? next.phrased.length - phrase.source.length + (gap.index ?? 0) : next.caret
      const to = gap ? from + gap[0].length : next.caret
      // Typing into the gap is typing, and searches the board as typing does.
      const phrasedNow = gap ? next.text.slice(0, from) : next.phrased
      setEdits(e => ({ ...e, text: next.text }))
      setPhrased(phrasedNow)
      setCursor(from)
      live.current = { text: next.text, phrased: phrasedNow, cursor: from }
      // After the render that writes the words, unless something was typed
      // into the box meanwhile — then it is theirs.
      setTimeout(() => {
        const el = box.current
        if (!el || el.value !== next.text || !mayTakeCaret()) return
        el.focus()
        el.setSelectionRange(from, to)
      }, 0)
      return 'inserted' as const
    },
    [open, box],
  )

  return {
    draft,
    isUntouched,
    typed,
    phrased,
    cursor,
    open,
    choose,
    startNew,
    setText,
    rewrite,
    setVoice,
    trackCursor,
    setCursor,
  }
}

export type Editor = ReturnType<typeof useEditor>
