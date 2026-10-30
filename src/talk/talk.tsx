// The talking screen.
//
// State lives in four hooks — the board, the message, the phrase being edited,
// and the toast — so what is left here is the screen's own business: which
// category is showing, whether the app is in edit mode or resting, and what to
// say when an operation finishes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { loadTranslations } from '../core/translation'
import {
  cancelAllDwells,
  holdDwells,
  holdDwellsUntilMoved,
  holdIfMovedUnder,
  RestingContext,
  setSpeakingLock,
  targetUnderPointer,
} from '../ui/dwell'
import { EditCtx, type EditCtxValue } from '../ui/edit-mode'
import { useSettings } from '../ui/settings'
import {
  LIBRARY,
  aliasOverlay,
  compose,
  composeWithBlank,
  composeWritten,
  hasChoices,
  parseSegments,
  type Phrase,
} from '../core/phrases'
import { soleLink, stripMarkdown } from '../core/markdown'
import { openLink } from '../core/links'
import {
  forgetReplyContext,
  loadReplyKey,
  loadReplyKeyAt,
  loadHiddenTabs,
  loadRecent,
  saveHiddenTabs,
  saveReplyKey,
  saveRecent,
  type PhraseStore,
  type User,
} from '../core/store'
import { type Change } from '../core/history'
import { type AppState } from '../core/backup'
import { isSpeaking, speak, subscribeSpeaking, warmVoice } from '../voice/speech'
import { cx } from '../ui/style'
import { BusyIndicator, DwellCursor, PanelButton } from '../ui/controls'
import { Keyboard } from '../ui/keyboard'
import { type PasteResult } from '../ui/link-input'
import { Topbar } from './topbar'
import { PhraseGrid } from './grid'
import { FilterBar } from './filter-bar'
import { SortControl } from './sort-control'
import { EmergencyBar } from './emergency'
import { SlotPicker } from './slots'
import { AskFirst, CategoryModal, EmergencyModal } from './editors'
import { TopPanel } from '../menu/menu'
import { useBoard } from './use-board'
import { useHistory } from './use-history'
import { useComposer } from './use-composer'
import { useEditor } from './use-editor'
import { useListen } from './use-listen'
import { TRANSLATED_CATEGORY, TRANSLATED_FILTER, useTranslated, voiceForTranslated } from './use-translated'
import { SUGGEST_CATEGORY, SUGGEST_FILTER } from './suggestions'
import { useApologies } from './use-apologies'
import { useSynchronized } from './use-synchronized'
import { useNotKeeping } from './use-not-keeping'
import { useNewVersion } from './use-new-version'
import { useGridOrder } from './use-grid-order'
import { useUsage } from './use-usage'
import { useToast } from './use-toast'
import { usePresentation } from './use-presentation'
import { ToastRegion } from './toast'
import { BESIDE_THE_BOARD, Introduction } from '../menu/introduction'
import { PHONE, useMediaQuery } from '../ui/media'

/**
 * A phrase's words in quotation marks, as Undo and Redo name the change they
 * reach — its markup off, and cut short where it would not fit on a toast.
 */
function quoted(text: string) {
  const words = stripMarkdown(text).trim()
  return `“${words.length > 40 ? `${words.slice(0, 39).trimEnd()}…` : words}”`
}

export function TalkScreen({
  user,
  onSignOut,
  arrivedBySignIn = false,
}: {
  user: User
  onSignOut: () => void
  /** Signed in on this page a moment ago, rather than opened already signed in. */
  arrivedBySignIn?: boolean
}) {
  const { settings, update } = useSettings()
  /**
   * **Getting started opens on signing in**, unless somebody has said not to —
   * the box on its first page, or the row in Settings. On signing in rather
   * than on every load, so a reload in the middle of a conversation does not
   * put a guide in front of the board. See docs/decisions/getting-started.md.
   */
  const [introducing, setIntroducing] = useState(() => arrivedBySignIn && settings.introduction)
  /** Beside the board rather than in its place — see `BESIDE_THE_BOARD`. */
  const beside = useMediaQuery(BESIDE_THE_BOARD) && introducing
  // No Undo on a phone to name in a toast — see `PHONE`.
  const phone = useMediaQuery(PHONE)
  const closeIntroduction = useCallback(() => {
    // The board arrives under a pointer resting where Close was.
    holdDwells()
    setIntroducing(false)
  }, [])
  const board = useBoard()
  // Before the composer, which speaks into it: a message said in another
  // language is the one translation that is nowhere on the board.
  const translated = useTranslated()
  const composer = useComposer({ onTranslated: translated.record })
  /**
   * The key behind a suggested reply, held here for the same two reasons the
   * account above is: it is part of what synchronizing sends, and a settings row
   * holding its own copy would go stale the moment a board arrived carrying a
   * different one.
   */
  const [replyKey, setStoredReplyKey] = useState(loadReplyKey)
  // When it was given or taken away, which is how two devices settle whose key
  // stands — see `replyKeyFrom` in `core/sync.ts`. Now, when it is typed here;
  // the time it was given, when it arrives from another device.
  const [replyKeyAt, setReplyKeyAt] = useState(loadReplyKeyAt)
  const setReplyKey = useCallback((next: string, at?: number) => {
    if (next === loadReplyKey() && (at === undefined || at === loadReplyKeyAt())) return
    const when = at ?? Date.now()
    saveReplyKey(next, when)
    // Taking the key away takes today's conversation with it. What is left
    // otherwise is a transcript of what somebody was asked, kept on behalf of a
    // feature they have just switched off.
    if (!next) forgetReplyContext()
    setStoredReplyKey(next)
    setReplyKeyAt(when)
  }, [])

  const { toast, flashToast } = useToast()

  // Presentation mode — see `use-presentation.ts`. Refused the way a link is,
  // and answered the same way: allowing pop-ups is the one thing that fixes it.
  const presentationBlocked = useCallback(
    () => flashToast('Blocked. Allow pop-ups for Peri to open the presentation window by dwelling'),
    [flashToast],
  )
  // **Every mode says it changed**, as auto-speak does: the lit toggle is a
  // glyph in a strip, and the toast is where a gaze working the board already is.
  const presentationChanged = useCallback(
    (on: boolean) =>
      flashToast(on ? 'Presenting — what is said shows in its own window' : 'Presentation window closed'),
    [flashToast],
  )
  const { presenting, toggle: togglePresenting } = usePresentation(presentationBlocked, presentationChanged)

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState(LIBRARY)
  const [editMode, setEditMode] = useState(false)
  // **No reorder modes**: the tab showing, the phrase open in the box and the
  // emergency phrase open there each carry a drag pad of their own — see
  // `FilterBar`, `PhraseGrid` and `EmergencyBar`.
  const [resting, setResting] = useState(false)
  // A name to ask before deleting it — the bin on the tab showing — or null to
  // add one. See `CategoryModal`.
  /** An emergency phrase's words, shown whole in the phrase table — see `onPeek` in `EmergencyBar`. */
  const [peek, setPeek] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<{ name: string | null } | null>(null)
  /**
   * A phrase whose choices are being asked for, and what happens once they are
   * made: said as a phrase chosen in auto-speak is, in its own voice, or said
   * from the box as Speak says it — see `handleSpeak`.
   */
  const [filling, setFilling] = useState<{
    phrase: Phrase
    then: 'say' | 'speak'
    voiceURI?: string
    keep?: boolean
  } | null>(null)
  /**
   * The phrase the board is pointing at, and the tab it moved to to do it.
   *
   * Two things put something here: a phrase just **made**, which would
   * otherwise be one more cell among a couple of thousand and a toast that
   * fades, and a phrase just **found** — the message box holding one that is
   * already on the board, on the way into edit mode.
   *
   * The grid marks the cell and brings it into view; the bar brings the tab to
   * its middle, and only where the board moved by itself. **A fresh object
   * every time**, because being pointed at the same phrase twice is two
   * occasions and both components key on the identity.
   */
  /** What was under the pointer as a mode was switched — see the effect after `setMode`. */
  const beforeSwitch = useRef<Element | null | undefined>(undefined)
  const [pointing, setPointing] = useState<{ id: string; movedTo: string | null } | null>(null)
  const [recent, setRecent] = useState(loadRecent)

  const { store, allCategories, voiceFor, phraseSaying, categoriesOf } = board

  // The phrase being written, which in edit mode is what the message box holds.
  // There is always one — pointing it at a phrase is what choosing a cell does
  // in edit mode, and there is nothing to open and nothing to close.
  const editor = useEditor({
    allCategories,
    tab: activeFilter,
    recent,
    voiceFor,
    duplicateOf: board.duplicateOf,
    categoriesOf: board.categoriesOf,
    box: composer.textareaRef,
  })
  const { draft, startNew, open: openPhrase } = editor
  /**
   * **Undo and Redo** for what is done to the board: a phrase saved, deleted or
   * taken out of a category, and a category deleted — see `use-history.ts`.
   */
  const history = useHistory(board.store, board.replaceStore)
  const { record: recordChange } = history
  // Pulled out rather than reached through `composer`, which is a fresh object
  // every render: a callback depending on the whole of it would change identity
  // on every render too, and `deliverPhrase` reaches the memoised phrase cells.
  const {
    propose: proposeMessage,
    showSaid,
    holdsSaid,
    saidIn,
    text: message,
    typed,
    load: loadMessage,
    copy: copyMessage,
    speak: speakMessage,
  } = composer

  // Every phrase on the board, the emergency bar included, in the board's own
  // order: what a suggested reply prefers to be — those are the person's
  // phrases as much as the grid's are — and what a spreadsheet of the board
  // holds.
  const boardPhrases = useMemo(
    () => [...board.mainPhrases, ...board.emergencyPhrases],
    [board.mainPhrases, board.emergencyPhrases],
  )

  /**
   * Listen mode: the other half of the conversation — see `use-listen.ts`.
   *
   * The answers it offers land on the board rather than in the message box, and
   * one chosen is `propose`d rather than set, so whatever was in the box is one
   * dwell on Undo away. **Nothing here speaks**, whatever mode the board is in.
   */
  /**
   * The board apologising for itself while a reply is being written — see
   * `listen/apology.ts`.
   *
   * **Said, and not otherwise treated as anything.** It is not kept in
   * Library, counts towards no phrase, and is not in the conversation the
   * next reply is written against: it is the board's sentence, not theirs.
   * `instant` for the reason the emergency bar has it — this fills a wait, so
   * it cannot start one of its own.
   */
  const nextApology = useApologies(settings.language)
  const apologise = useCallback(() => {
    speak(nextApology(), settings, { instant: true })
  }, [nextApology, settings])

  const listener = useListen({
    language: settings.language,
    replyKey,
    replyModel: settings.replyModel,
    phrases: boardPhrases,
    // In edit mode — which is how a question is answered — the box is empty
    // when nothing is written in it; a phrase opened there is words. Outside
    // it, a phrase auto-speak has just said is not a message being written.
    messageEmpty: editMode ? draft.text.trim() === '' : message.trim() === '' || holdsSaid,
    onWaiting: apologise,
  })

  /** Whether answers to a question are on their way. */
  const askingForAnswers = listener.heard.asking

  /**
   * Whether the board is holding answers, or about to be.
   *
   * It covers the wait as well as the answers themselves, so the tab appears
   * the moment a question goes off to be answered: the waiting line then stands
   * where the answers will, rather than in the message box, which is not where
   * anything is going to arrive any more. And it outlasts the question, the
   * most recent answers being kept until newer ones replace them.
   */
  const offering = askingForAnswers || listener.suggestions.length > 0
  /** The tab to go back to once the question is done with. */
  const beforeAnswers = useRef<string | null>(null)

  // Derived from the live phrase list so user-added categories get a tab and
  // fully-hidden categories lose theirs.
  const tabs = useMemo(
    () => [
      // **The tabs that are not categories come first, always in one order** —
      // Translations, the answers, Library — and then the categories somebody
      // made, in the order they chose. None of the three can be renamed, and the
      // custom order cannot move them out of the places a user learns to look.
      { id: TRANSLATED_FILTER, label: TRANSLATED_CATEGORY, fixed: true },
      // From the first question answered on: the most recent answers stay until
      // newer ones replace them, and somebody may want to go back to one after
      // the box is closed.
      ...(offering ? [{ id: SUGGEST_FILTER, label: SUGGEST_CATEGORY, fixed: true }] : []),
      // **Library is where every phrase lives**; the categories refer to its
      // phrases, and what is said is kept in it.
      { id: LIBRARY, label: LIBRARY, fixed: true },
      ...allCategories.map(c => ({ id: c, label: c })),
    ],
    [allCategories, offering],
  )

  /**
   * **The board goes to the answers, and comes back afterwards.**
   *
   * Somebody has just been spoken to and has a person waiting in front of them;
   * a tab they have to find first spends the seconds this exists to give back.
   * So the board goes to the answers as they are asked for, and when the
   * question is done with — the box closed, or nothing came of asking — it goes
   * back to the tab they were on rather than to Library, a category they had
   * chosen being where they were working.
   *
   * **On the asking, not on there being answers.** The most recent answers are
   * kept after the question has gone, so there being some says nothing about
   * whether anybody is being asked anything; opening the box again must not
   * take the board to answers nobody is waiting for.
   *
   * **Every cell on the board changes underneath a pointer that has not moved**,
   * which is the hazard `holdDwellsUntilMoved` is for: nothing may be chosen
   * until the gaze leaves whatever it is resting on. The answers landing are a
   * second move, a second or two after the tab's — see the effect after
   * `showingSuggestions`.
   */
  useEffect(() => {
    if (askingForAnswers) {
      setActiveFilter(current => {
        if (current !== SUGGEST_FILTER) beforeAnswers.current = current
        return SUGGEST_FILTER
      })
    } else if (beforeAnswers.current !== null && (!listener.open || !offering)) {
      const back = beforeAnswers.current
      beforeAnswers.current = null
      setActiveFilter(current => (current === SUGGEST_FILTER ? back : current))
    } else {
      // Nothing moved — the first render among other things, and a board deaf
      // on arrival would refuse the first thing anybody chose.
      return
    }
    holdDwellsUntilMoved()
  }, [askingForAnswers, offering, listener.open])

  // Emergency has no tab of its own, so it would otherwise be the one set of
  // phrases that could not be exported on its own.
  const backupCategories = useMemo(() => [LIBRARY, ...allCategories, 'Emergency'], [allCategories])

  // Deleting the last phrase in a category takes its tab away; fall back to
  // Library rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === LIBRARY ||
    activeFilter === TRANSLATED_FILTER ||
    (activeFilter === SUGGEST_FILTER && offering) ||
    allCategories.includes(activeFilter)
      ? activeFilter
      : LIBRARY

  const showingTranslated = effectiveFilter === TRANSLATED_FILTER
  const showingSuggestions = effectiveFilter === SUGGEST_FILTER

  // The answers landing, or coming back after a request that failed: twenty
  // cells where the waiting line was, under a gaze that has not moved.
  useEffect(() => {
    if (showingSuggestions && listener.suggestions.length) holdDwellsUntilMoved()
  }, [showingSuggestions, listener.suggestions])

  /**
   * Whether this tab holds phrases in an order of its own — Library or a
   * category: somewhere a hand arrangement can be built, and so somewhere Custom
   * order means anything. Neither the answers nor Translations is one.
   */
  const canArrange = !showingTranslated && !showingSuggestions

  // Translations are their own list rather than part of the board: a record of
  // what was said in another language, not phrases anybody added.
  /**
   * **What is typed narrows the grid in every mode** — the message being
   * composed, and in edit mode the phrase being written: the same rule, in
   * `talk/typed.ts`, so a phrase put in the box is finished and narrows
   * nothing, and what is typed after it searches Library. Opening a phrase to
   * edit is putting one in the box, so it narrows nothing either, and turning
   * edit mode on carries the word being typed in with the message, so the
   * grid does not change.
   *
   * **The answers are not narrowed either**, and for a sharper version of the
   * same reason: they are alternatives to one question rather than completions
   * of a word, and choosing one puts its words in the box — so the word at the
   * caret would be a word of the answer they just took, and the other nineteen
   * would disappear at the moment somebody wanted to compare them.
   */
  const filterWord = showingSuggestions ? '' : editMode ? editor.typed : typed

  // How often each phrase is used — see `use-usage.ts`. The record follows every
  // phrase chosen; what the board is *ordered* by does not, which is the next
  // thing down.
  const usage = useUsage()
  // Pulled out for the reason `insertPhrase` is: `handleSelectPhrase` reaches
  // every one of a couple of thousand memoised cells, and a callback depending
  // on the whole of a hook result depends on a fresh object every render.
  const { record: recordUsed, forget: forgetUsed, restore: restoreUsed } = usage
  // Pulled out for the same reason: both reach the memoised cells too.
  const { record: recordTranslated, forget: forgetTranslated } = translated
  // And these two, which reach them from the answers side. Both are stable
  // across a question changing, which is why they are callbacks on the hook
  // rather than anything read off `heard`.
  const { chose: listenerChose, forgetSuggestion, forgetAnswers } = listener

  /**
   * Today's questions, the answers chosen, and the answers still on the board —
   * the control in the Settings row for somebody who wants the conversation
   * gone now rather than in the morning. Storage and the board both, because
   * the answers on the board are held here and would otherwise stay up until
   * the next reload.
   */
  const forgetConversation = useCallback(() => {
    forgetReplyContext()
    forgetAnswers()
  }, [forgetAnswers])

  /** Whether anything is being said. */
  const speaking = useSyncExternalStore(subscribeSpeaking, isSpeaking)
  /**
   * How many times something said has come to an end — which the board takes
   * its new order after. Counted rather than read off `speaking`: words that
   * begin and end between two renders, a clip that fails at once, would never
   * be seen to have been said at all.
   */
  const [saidTimes, setSaidTimes] = useState(0)
  /**
   * **A message said for the first time, pointed at once it has been said** —
   * see `keepSaid`. Held here until the words end, because the board takes its
   * new order then and a phrase pointed at sooner would move after the board
   * had scrolled to it; and then until the board shows the tab again, the box
   * no longer searching — while it is, the message is what it has found, and a
   * scroll made then would be lost the moment the box was cleared.
   */
  const pointWhenSaid = useRef<string | null>(null)
  const [pointWhenShown, setPointWhenShown] = useState<string | null>(null)
  useEffect(
    () =>
      subscribeSpeaking(on => {
        if (on) return
        setSaidTimes(n => n + 1)
        const id = pointWhenSaid.current
        pointWhenSaid.current = null
        if (id) setPointWhenShown(id)
      }),
    [],
  )

  // What order the grid is in, and what it shows — see `use-grid-order.ts`.
  const { phraseSort, visiblePhrases, chooseSort, handleReorderPhrases } = useGridOrder({
    board,
    tab: effectiveFilter,
    canArrange,
    showingTranslated,
    showingSuggestions,
    translatedPhrases: translated.phrases,
    suggestions: listener.suggestions,
    counts: usage.counts,
    filterWord,
    saidTimes,
  })

  /**
   * **The phrase open in the box stays on the board once it is being changed.**
   * Its cell carries its tools, and rewording it is what brings the bin — so a
   * word typed after it, searching Library, would otherwise take away its cell
   * and the bin with it; and a phrase opened from the message under a tab that
   * does not hold it would have no bin anywhere. First, where the tab or the
   * search does not show it — and `pinned`, since it has no place in this
   * tab's order to be moved about in.
   *
   * **Only once the words have changed or the board is narrowed**, both of
   * which change the grid already: turning edit mode on is a change of what a
   * dwell does, not of what is in front of somebody, and a cell arriving at
   * the top would move every other under a resting pointer.
   */
  const openInGrid =
    editMode && draft.phrase && !draft.isEmergency && (filterWord !== '' || draft.text !== draft.phrase.source)
      ? draft.phrase
      : null
  const pinned = openInGrid !== null && !visiblePhrases.some(p => p.id === openInGrid.id)
  const gridPhrases = useMemo(
    () => (pinned && openInGrid ? [openInGrid, ...visiblePhrases] : visiblePhrases),
    [pinned, openInGrid, visiblePhrases],
  )

  /**
   * **What is said is saved as edit mode's Save would save it** — every message
   * spoken or copied kept in Library, as a phrase of its own, unless Library
   * says it already — **and in the category whose tab is showing**, so a
   * sentence said on a tab is there on the tab afterwards. **One Library says
   * already is filed there too**, as Save files words already on the board:
   * a phrase found by typing on a tab and said is one somebody wanted on it.
   * A new one is counted as used the moment it is, so it is first under
   * Recently used and first among what typing finds; one already there is not
   * counted again, choosing it off the board having counted it. There was a
   * Sent tab for this; see docs/decisions/sent-messages.md. Either is pointed
   * at, and reached by Undo; where a tab took it, what to say about that is
   * handed back for a toast — a copy says it after its own.
   */
  const { keepSaid: keepInLibrary, refile } = board
  const keptInto = activeFilter !== LIBRARY && allCategories.includes(activeFilter) ? activeFilter : undefined
  const keepSaid = useCallback(
    (text: string): string | undefined => {
      // **And the board points at it** — marked, and scrolled to wherever the
      // order puts it — as a phrase just saved is. Kept and never seen, it was
      // a phrase lost: a message used once sits after everything used more
      // under Most used, and at the very end of a hand arrangement. Once what
      // is being said has ended, or now, where nothing is — a copy.
      const point = (id: string) => {
        if (isSpeaking()) pointWhenSaid.current = id
        else setPointWhenShown(id)
      }
      const id = keepInLibrary(text, keptInto)
      if (id) {
        recordUsed(id)
        recordChange({ what: `Kept ${quoted(text)}`, phrase: id, tab: keptInto ?? LIBRARY })
        point(id)
        return keptInto && `Added to ${keptInto}`
      }
      const there = keptInto ? phraseSaying(text.trim()) : undefined
      if (!there || !keptInto) return undefined
      const filed = categoriesOf(there.id)
      if (filed.includes(keptInto)) return undefined
      refile(there.id, [...filed, keptInto])
      recordChange({ what: `Added ${quoted(text)} to ${keptInto}`, phrase: there.id, tab: keptInto })
      point(there.id)
      return `Already on the board — added to ${keptInto}`
    },
    [keepInLibrary, keptInto, recordUsed, recordChange, phraseSaying, categoriesOf, refile],
  )
  // Adjusted during render, as state that follows state is: the board points
  // in the render that shows the tab again, so no frame shows it unmarked.
  if (pointWhenShown && !filterWord) {
    setPointWhenShown(null)
    setPointing({ id: pointWhenShown, movedTo: null })
  }

  // ── Choosing a phrase ──────────────────────────────────────────────────────

  /**
   * **A phrase chosen outside edit mode is said** — the board is in auto-speak
   * whenever it is not in edit mode, there being no third way of working any
   * more — and this is the moment it counts as said. It goes in the box as
   * well, in place of what was there and selected, so it can be copied, said
   * again or typed over: **as it was written** (`written`, see
   * `composeWritten`), the words edit mode opens it on, markup and full stop
   * and all, and remembered with the voice and the language it was said in,
   * so Speak says it again the same way.
   */
  const deliverPhrase = useCallback(
    (phraseText: string, voiceURI?: string, alreadyIn?: string, written = phraseText) => {
      {
        speak(phraseText, settings, {
          voiceURI,
          // Set only from the Translations tab: those words have been translated
          // already, so they are said as they stand rather than sent through the
          // service a second time to ask for Spanish from Spanish.
          alreadyIn,
          // The moment a phrase comes out in another language. `speak` reports
          // only the paths that really translate, and the `alreadyIn` one above
          // returns before any of them — so a cell in the tab saying itself
          // again is silent here without needing a second guard.
          onTranslated: recordTranslated,
          please: settings.please,
        })
        // Not a cell off Translations, which is in another language and is
        // kept there already. **As it was written**, as Library holds it: the
        // words without their full stop are a wording Library does not have,
        // and every phrase ending in one was kept a second time without it.
        const filed = alreadyIn ? undefined : keepSaid(written)
        if (filed) flashToast(filed)
        showSaid(written, { voiceURI, alreadyIn })
      }
    },
    [settings, keepSaid, recordTranslated, showSaid, flashToast],
  )

  const handleSelectPhrase = useCallback(
    (phrase: Phrase) => {
      /**
       * **An answer is never spoken by the dwell that chose it**, whatever mode
       * the board is in — the rule the whole of `listen/suggest.ts` is arranged
       * around, and it matters more here than it did when there was one reply
       * in the message box: a gaze resting on a cell is how somebody *reads*
       * it, and with auto-speak on that rest would say a machine's sentence out
       * loud before they had finished reading it.
       *
       * So it goes to the message box, through the composer's own history: one
       * dwell on Undo puts back whatever was there, another answer replaces
       * this one, and it is said when they rest on Speak.
       */
      if (showingSuggestions) {
        // Recomposed rather than read off the phrase, for the offset alone — a
        // gap has no characters to find in `phrase.text`.
        const { text, blankAt } = composeWithBlank(phrase.segments)
        proposeMessage(text, blankAt)
        // The one they took is what the next question is answered alongside.
        listenerChose(text)
        return
      }
      // Counted here rather than at the speaker, because this is the one place a
      // phrase is *chosen* to be said — or followed, for a link. Edit mode never
      // reaches here: a cell goes to the editor instead (`chooseInEdit`).
      //
      // Not under Translations or the answers. Those ids name a translation or
      // something a model offered a minute ago rather than a phrase on the
      // board, so counting them would fill the record with ids that can never
      // match anything and never fall out.
      if (!showingTranslated && !showingSuggestions) recordUsed(phrase.id)
      // Auto-speak changes the box, in place of what was there, and that can
      // grow the box and push the grid down or end a search and widen it — but
      // held for every phrase, it would hold the quick back-and-forth auto-speak
      // is for where nothing moved at all. **Every cell guards itself instead**
      // against arriving under a pointer at rest (`cameToPointer` in
      // `ui/dwell.ts`), which answers exactly the case where something did
      // move. The order no longer moves — see `ranking` above.
      // A phrase that is nothing but a link is a button for going somewhere, so
      // it goes there instead of saying its own label out loud. A phrase with
      // words around a link is still a sentence and still speaks — see
      // `soleLink` for where that line is drawn.
      const url = soleLink(phrase.segments)
      if (url) {
        cancelAllDwells()
        // A browser only allows this off the back of a press, and a dwell has
        // none in it — so for the users this app is for, being refused is the
        // ordinary outcome rather than a rare one. Allowing pop-ups for the
        // site is the one thing that actually fixes it, so the message names
        // that rather than merely reporting the failure.
        if (!openLink(url)) flashToast('Blocked. Allow pop-ups for Peri to open links by dwelling')
        return
      }
      // **A phrase with choices goes in the box as edit mode shows it**, its
      // choices still in it, and they are asked for as it is said — straight
      // away, here. Filled in as it went in, the box held one wording of it:
      // words edit mode could not open as the phrase they came from.
      if (hasChoices(phrase.segments)) {
        const voiceURI = voiceFor(phrase.id)
        showSaid(phrase.source, { voiceURI })
        cancelAllDwells()
        setFilling({ phrase, then: 'say', voiceURI, keep: !showingTranslated })
        return
      }
      // A translated cell carries the language it is in, and is said in the
      // voice that was chosen while the board spoke it.
      deliverPhrase(
        phrase.text,
        phrase.lang ? voiceForTranslated(settings, phrase.lang) : voiceFor(phrase.id),
        phrase.lang,
        composeWritten(phrase.segments),
      )
    },
    [
      deliverPhrase,
      showSaid,
      voiceFor,
      flashToast,
      showingTranslated,
      showingSuggestions,
      proposeMessage,
      listenerChose,
      recordUsed,
      settings,
    ],
  )

  // ── Editing what is on the board ───────────────────────────────────────────

  /**
   * Where the board has to go to put a phrase in front of somebody, or null
   * where it is in front of them already.
   *
   * **Library holds every phrase**, so a phrase is on it already and moving
   * would only take somebody off the tab they chose; so is a category that
   * refers to it. Anywhere else it goes to the first category it is in, or to
   * Library where it is in none. The three pinned records show none of it, so
   * those move like any other tab.
   */
  const moveToShow = useCallback(
    (categories: string[]) =>
      effectiveFilter === LIBRARY || categories.includes(effectiveFilter) ? null : (categories[0] ?? LIBRARY),
    [effectiveFilter],
  )

  /**
   * A tab somebody dwelled on — which, in edit mode, is also where a new
   * phrase goes: see `startsIn` in `use-editor.ts`.
   */
  const chooseTab = setActiveFilter

  /** Show a tab the board chose itself, rather than one somebody dwelled on. */
  const showTab = useCallback((tab: string) => {
    setActiveFilter(tab)
    // Every cell has just been replaced under a pointer that has not moved,
    // and in edit mode the one landing underneath opens for rewording.
    holdDwellsUntilMoved()
  }, [])

  /**
   * Save what is in the box.
   *
   * Nothing closes afterwards, because nothing was opened — the editor goes back
   * to a blank phrase, ready for the next one. So this is the only place that
   * can say the save happened, and it says it out loud.
   */
  const saveDraft = useCallback((): string | undefined => {
    if (!draft.canSave) return undefined
    const { phrase, isEmergency, keeping, categories, sameAs, into } = draft
    // **Never a second copy.** The words are on the board already, so Save
    // puts that phrase in the category showing, and leaves anything opened
    // in the box as it was.
    if (sameAs && into) {
      board.refile(sameAs, [...categoriesOf(sameAs), into])
      recordChange({ what: `Added ${quoted(draft.text)} to ${into}`, phrase: sameAs, tab: effectiveFilter })
      setPointing({ id: sameAs, movedTo: null })
      startNew()
      flashToast(`Already on the board — added to ${into}`)
      return sameAs
    }
    const text = draft.text.trim()
    const voice = draft.voice || undefined

    // Warmed against what the phrase reads as, not what it is written as: the
    // editor holds the source, and nobody wants a clip of somebody reading
    // "open curly bracket, quote, red, quote" aloud.
    if (voice) void warmVoice(compose(parseSegments(text)), voice)
    // The voice the next one starts from.
    setRecent(current => {
      const next = { ...current, voice }
      saveRecent(next)
      return next
    })

    /**
     * Whether this is a phrase somebody is making, as against one they are
     * rewording — which is what everything below turns on. Keeping a message
     * is making one: the record it came off is left exactly as it was.
     */
    const making = phrase === null || keeping
    /**
     * **A phrase somebody has just made is on screen.** Filed anywhere but the
     * tab in front of them it lands among a couple of thousand cells, and what
     * they get for having written one is a line of text that fades.
     *
     * Three cases do not move, and none of them is an exception to that: on
     * **Library**, or a category it is in, the phrase is already there, the
     * **emergency bar** is on screen
     * under every tab, and a phrase being **reworded** is one somebody is
     * moving out of where they are — refiling several out of one category is a
     * run they would be thrown out of after the first.
     */
    const movesTo = making && !isEmergency ? moveToShow(categories) : null

    let saved: string
    if (making) {
      // The id comes back so a brand-new phrase can be given the voice chosen
      // for it — there is no id to hang one on until the phrase exists.
      const id = board.addPhrase(text, categories, isEmergency)
      saved = id
      if (voice) board.setVoice(id, voice)
      recordChange({
        what: keeping ? `Kept ${quoted(text)} as a phrase` : `Saved ${quoted(text)}`,
        phrase: id,
        tab: movesTo ?? effectiveFilter,
      })
      // Which cell it is, for the board to point at — see `pointing`.
      // Nothing for the emergency bar, whose phrases are never in the grid and
      // are on screen under every tab anyway.
      setPointing(isEmergency ? null : { id, movedTo: movesTo })
    } else {
      // Fetched and stored the moment it is assigned, so the phrase can be said
      // in that voice without waiting — including on the emergency bar, which
      // never waits.
      saved = phrase.id
      board.setVoice(phrase.id, voice)
      board.editPhrase(phrase, text, categories, isEmergency)
      recordChange({ what: `Saved ${quoted(text)}`, phrase: phrase.id, tab: effectiveFilter })
      // Into the category showing, as well as the ones it was in.
      // Nothing to point at: rewording puts no new cell anywhere, and the mark
      // on the last one is already gone — every dwell clears it, this one
      // included.
    }
    if (movesTo) showTab(movesTo)
    startNew()
    flashToast(
      keeping
        ? 'Kept as a phrase'
        : phrase === null
          ? `Added to ${isEmergency ? 'Emergency' : [LIBRARY, ...categories].join(', ')}`
          : into && !categoriesOf(phrase.id).includes(into)
            ? `Saved, and added to ${into}`
            : 'Saved',
    )
    return saved
  }, [draft, board, categoriesOf, startNew, flashToast, moveToShow, showTab, recordChange, effectiveFilter])
  const handleSave = saveDraft

  /**
   * **Words already on the board, said in a toast** as they are written — what
   * Save will do with them, or why it has gone quiet: a control that has gone
   * quiet explains nothing by itself. Once each time it changes, so writing on
   * says it once rather than at every letter, and moving to another tab says
   * what Save will do there. Nothing else in edit mode says what is being
   * edited — the box with the words in it says that.
   */
  const alreadyThere =
    editMode && draft.duplicate
      ? draft.sameAs
        ? `Already on the board — Save adds it to ${draft.into}`
        : draft.into
          ? `Already in ${draft.into}`
          : 'Already on the board'
      : null
  useEffect(() => {
    if (alreadyThere) flashToast(alreadyThere)
  }, [alreadyThere, flashToast])

  /**
   * **On a category somebody made, the bin takes the phrase out of it** rather
   * than off the board: a category only refers to Library's phrases, and the
   * phrase is still there, and in any other category it is in. On Library it
   * deletes.
   */
  const removingFrom =
    draft.phrase && !draft.keeping && store.members[effectiveFilter]?.includes(draft.phrase.id)
      ? effectiveFilter
      : null

  /**
   * **The phrase open in the box**, in edit mode — the active phrase, as the
   * tab showing is the active tab. Its cell, or its button on the emergency
   * bar, carries a drag pad, and a bin once its wording has been changed in
   * the box: the bin that stood in the card's row of controls. Every bin asks
   * first (`AskFirst`).
   */
  const openOnBoard =
    editMode && draft.phrase ? { id: draft.phrase.id, changed: draft.text !== draft.phrase.source } : null
  /**
   * **Nothing is chosen off the board while the box holds a phrase as it was
   * opened.** Choosing into words puts the phrase in at the caret, so a rest
   * meant only for reading the board would put a second phrase into the first;
   * once the words have been changed, somebody is building something, and a
   * phrase goes in as before. An empty box opens what is chosen. The grid is
   * not magnified meanwhile either. **The emergency bar is left alone**: it is
   * the one thing on the screen that has to answer whatever else is going on.
   */
  const choosing = !(openOnBoard && !openOnBoard.changed)
  const [askingDelete, setAskingDelete] = useState(false)
  // The question holds the dwells itself — see `AskFirst`.
  const askToDelete = useCallback(() => setAskingDelete(true), [])

  const handleDelete = useCallback(() => {
    const { phrase, keeping } = draft
    if (!phrase) return
    // Forgetting is the only way to take something off either record, and
    // somebody who has just said something private needs one. Which record is
    // read off the phrase itself, since the two tabs share every other part of
    // this path.
    if (keeping) {
      if (phrase.category === TRANSLATED_CATEGORY) forgetTranslated(phrase.id)
      else forgetSuggestion(phrase.id)
    } else if (removingFrom) {
      // On a category, the bin takes the phrase out of it and no further: it is
      // still in Library, with its count.
      board.removePhrase(phrase.id, removingFrom)
      recordChange({
        what: `Took ${quoted(phrase.text)} out of ${removingFrom}`,
        phrase: phrase.id,
        tab: effectiveFilter,
      })
    } else {
      board.removePhrase(phrase.id)
      // Its count goes with it, so the record stays the size of the board —
      // kept in the history instead, for an Undo to put back.
      const use = forgetUsed(phrase.id)
      recordChange({
        what: `Deleted ${quoted(phrase.text)}`,
        phrase: phrase.id,
        tab: effectiveFilter,
        ...(use && { use: { id: phrase.id, use } }),
      })
    }
    startNew()
    flashToast(
      keeping
        ? 'Forgotten'
        : removingFrom
          ? `Taken out of ${removingFrom}${phone ? '' : ' — Undo is beside Paste'}`
          : `Deleted${phone ? '' : ' — Undo is beside Paste'}`,
    )
  }, [
    draft,
    board,
    forgetTranslated,
    forgetSuggestion,
    forgetUsed,
    startNew,
    flashToast,
    removingFrom,
    recordChange,
    effectiveFilter,
    phone,
  ])

  // ── Editing the categories ─────────────────────────────────────────────────

  const addCategory = useCallback(() => {
    cancelAllDwells()
    setEditingCategory({ name: null })
  }, [])

  const handleCategorySave = useCallback(
    (name: string) => {
      board.addCategory(name)
      setEditingCategory(null)
    },
    [board],
  )

  // ── Adding to the emergency bar ────────────────────────────────────────────

  /**
   * **The plus after the bar's last button**, in every mode — see
   * `EmergencyModal`. Its words are typed in a dialog of its own, so the
   * message box and whatever is in it are left as they are.
   */
  const [addingEmergency, setAddingEmergency] = useState(false)
  const addEmergency = useCallback(() => {
    cancelAllDwells()
    setAddingEmergency(true)
  }, [])
  const saveEmergency = useCallback(
    (words: string) => {
      const id = board.addPhrase(words, [], true)
      recordChange({ what: `Added ${quoted(words)} to the emergency bar`, phrase: id })
      setAddingEmergency(false)
      flashToast('Added to Emergency')
    },
    [board, recordChange, flashToast],
  )

  /**
   * **The tabs taken off the bar** — this device's view of the board, behind
   * More, which puts them back. See `loadHiddenTabs`.
   */
  const [hiddenTabs, setHiddenTabs] = useState(loadHiddenTabs)
  const keepHidden = useCallback((next: string[]) => {
    saveHiddenTabs(next)
    setHiddenTabs(next)
  }, [])
  const hideTab = useCallback(
    (id: string) => {
      if (!hiddenTabs.includes(id)) keepHidden([...hiddenTabs, id])
    },
    [hiddenTabs, keepHidden],
  )
  // More's Done: what is off the bar, and — where it moved — the order of the
  // categories somebody made.
  const arrangeTabs = useCallback(
    (hidden: string[], order: string[]) => {
      keepHidden(hidden)
      if (order.some((id, i) => id !== allCategories[i])) board.arrangeCategories(order)
    },
    [keepHidden, allCategories, board],
  )

  const handleCategoryDelete = useCallback(() => {
    const name = editingCategory?.name
    if (!name) return
    const count = board.phraseCountByCategory.get(name) ?? 0
    board.removeCategory(name)
    recordChange({ what: `Deleted ${name}`, tab: name, ...(hiddenTabs.includes(name) && { hiddenTab: name }) })
    // Gone, it is hidden no longer — or a category made later under its name
    // would arrive off the bar.
    if (hiddenTabs.includes(name)) keepHidden(hiddenTabs.filter(id => id !== name))
    setActiveFilter(f => (f === name ? LIBRARY : f))
    // Nothing to do to the draft: a category that is gone drops out of the
    // ones it is ticked into by itself — see `useEditor`.
    setEditingCategory(null)
    flashToast(
      count > 0
        ? `Deleted ${name} — its ${count} phrase${count === 1 ? ' is' : 's are'} still in Library`
        : `Deleted ${name}`,
    )
  }, [editingCategory, board, flashToast, hiddenTabs, keepHidden, recordChange])

  /** Renamed where it stands, on its own tab — see `FilterBar`. */
  const renameCategory = useCallback(
    (from: string, to: string) => {
      board.renameCategoryTo(from, to)
      // Hidden under its old name, it stays hidden under its new one.
      if (hiddenTabs.includes(from)) keepHidden(hiddenTabs.map(id => (id === from ? to : id)))
      setActiveFilter(f => (f === from ? to : f))
      flashToast(`Renamed ${from} to ${to}`)
    },
    [board, flashToast, hiddenTabs, keepHidden],
  )

  /** The bin on the tab showing, which asks before anything goes. */
  const askToDeleteCategory = useCallback((name: string) => setEditingCategory({ name }), [])

  /**
   * **What Undo or Redo leaves on screen**: the tab the change was made on,
   * where it is still there; the phrase it was about, open in the box in edit
   * mode — where an undone delete was when the bin took it — and marked on the
   * board; and the count and the hidden tab it took with it, put back or taken
   * again. A phrase open in the box that the change took off the board leaves
   * it.
   */
  const { undo: undoChange, redo: redoChange } = history
  const { phraseIn } = board
  const showStep = useCallback(
    (step: { change: Change; next: PhraseStore } | null, undone: boolean) => {
      if (!step) return
      const { change, next } = step
      const back = undone
      if (change.use) {
        if (back) restoreUsed(change.use.id, change.use.use)
        else forgetUsed(change.use.id)
      }
      if (change.hiddenTab) {
        const there = change.hiddenTab in next.members
        if (there && !hiddenTabs.includes(change.hiddenTab)) keepHidden([...hiddenTabs, change.hiddenTab])
        if (!there) keepHidden(hiddenTabs.filter(id => id !== change.hiddenTab))
      }
      if (change.tab && (change.tab === LIBRARY || change.tab in next.members)) setActiveFilter(change.tab)
      const found = change.phrase ? phraseIn(next, change.phrase) : null
      if (found && editMode) openPhrase(found.phrase, found.isEmergency)
      else if (draft.phrase && !phraseIn(next, draft.phrase.id)) startNew()
      setPointing(found && !found.isEmergency ? { id: found.phrase.id, movedTo: null } : null)
      flashToast(`${back ? 'Undone' : 'Done again'}: ${change.what}`)
    },
    [
      restoreUsed,
      forgetUsed,
      hiddenTabs,
      keepHidden,
      phraseIn,
      editMode,
      openPhrase,
      draft.phrase,
      startNew,
      flashToast,
    ],
  )
  const handleUndo = useCallback(() => showStep(undoChange(), true), [showStep, undoChange])
  const handleRedo = useCallback(() => showStep(redoChange(), false), [showStep, redoChange])

  // ── Modes ──────────────────────────────────────────────────────────────────

  /**
   * What a dwell on a phrase means. Two answers, and always exactly one:
   *
   *  * **speak** — it is said this instant. The board is a talker, and this is
   *    where it starts, so opening the app for the first time is enough to be
   *    able to say something.
   *  * **edit** — into an empty box it opens, to be reworded or deleted; into
   *    one with words in it, it goes in at the caret. A sentence built out of
   *    several phrases is built here, and Speak beside Save says it and keeps
   *    it — see `handleSpeak`.
   *
   * **Turning one on turns the other off, and turning one off turns the other
   * on.** There was a third — composing, where a phrase went into the box and
   * nothing else happened — and it was taken out on request: building a
   * sentence is what edit mode's box does now, so the two toggles are one
   * choice drawn twice, and each always does something.
   *
   * Entering edit mode carries whatever is in the message box in with it, so a
   * message worth keeping becomes a phrase without being typed again.
   *
   * **And it files the next new phrase under the tab in front of them.**
   * Somebody going into edit mode with a category on screen is nearly always
   * adding to that category, and the alternative was a picker landing on
   * wherever the last phrase went — which after one trip to a different tab is
   * the wrong answer for every phrase after it. Only on the way *in*: leaving
   * edit mode says nothing about where anything belongs.
   *
   * **Unless what it carries in is already on the board**, in which case the
   * editor opens on the phrase rather than on a copy of it — a copy cannot be
   * saved and says only *Already on the board* — so its own category and voice
   * are what the strip shows, and Save saves it.
   *
   * **And nothing else on screen changes.** The words in the box stay, and so
   * does the grid: the tab, where it is scrolled to, and the word it was
   * narrowed to, which is still the word being typed (see `filterWord`). Turning the mode on is a change of what a dwell does, not of
   * what is in front of somebody — the board used to go to Library, scroll to
   * the phrase, and drop the narrowing, so the cell they had just been looking
   * at was somewhere else the moment the mode came on.
   */
  const setMode = useCallback(
    // `carry` is false only for the microphone, which empties the box anyway —
    // on the way into edit mode as well as out of it.
    (mode: 'speak' | 'edit', carry = true) => {
      // What the pointer is on, to compare once the switch has been laid out —
      // see `beforeSwitch`.
      beforeSwitch.current = targetUnderPointer()
      update({ autoSpeak: mode === 'speak' })
      setEditMode(mode === 'edit')
      // **Leaving edit mode, what the box holds becomes the message** — the
      // words, the caret and what was typed, so the box and the grid narrowed to
      // it stay as they were. A phrase with choices in it is carried as the
      // board shows it, since a message says what is in it and `{drink}` would
      // be said as written.
      if (carry && editMode && mode !== 'edit') {
        const segments = parseSegments(draft.text)
        if (segments.some(s => s.kind === 'slot')) {
          const { text, blankAt } = composeWithBlank(segments)
          loadMessage(text, text, blankAt >= 0 ? blankAt : text.length)
        } else {
          loadMessage(draft.text, editor.phrased, editor.cursor)
        }
      }
      // Already speaking, nothing moves.
      if (mode === 'speak' && !editMode) {
        flashToast('Auto-speak on — phrases speak immediately')
        return
      }
      const carried = mode === 'edit' && carry ? message.trim() : ''
      const already = carried ? phraseSaying(carried) : undefined
      // The phrase itself, or a new one carrying whatever was composed — with
      // the word being typed still being typed, so the grid stays narrowed to it.
      if (already) openPhrase(already)
      else startNew(carried, typed && carried.endsWith(typed) ? carried.slice(0, -typed.length) : carried)
      // The lit toggle is the only other cue, and it is a 1.5rem icon in a
      // strip — say plainly which of the two the board is now in.
      flashToast(
        mode === 'speak'
          ? 'Auto-speak on — phrases speak immediately'
          : // Which is not the phrase they last said but the one they were
            // holding, and the box now holds it as it was written.
            already
            ? `Editing this phrase, in ${effectiveFilter === LIBRARY || !categoriesOf(already.id).includes(effectiveFilter) ? LIBRARY : effectiveFilter}`
            : // Short enough for three lines of a phone, in the wider fonts
              // other systems draw it in.
              carried
              ? 'Edit mode — phrases go in at the caret'
              : 'Edit mode — build or change a phrase',
      )
    },
    [
      message,
      typed,
      editMode,
      draft.text,
      editor.phrased,
      editor.cursor,
      loadMessage,
      startNew,
      openPhrase,
      update,
      flashToast,
      effectiveFilter,
      phraseSaying,
      categoriesOf,
    ],
  )

  /**
   * **A mode switch can move the screen under the pointer that made it.** Edit
   * mode brings the language, the voice and what is being edited into the
   * card, and on some screens that grows its row of controls; leaving it
   * shrinks the row again and the message box slides up under a pointer still
   * resting where the toggle was. Its caret dwell then put the caret there —
   * the very start of the words — and everything typed after went in front of
   * what came before. So once the switch is laid out, and again a frame later
   * when the box has been fitted, what is under the pointer is compared with
   * what was: anything else there, and nothing may be chosen until the pointer
   * moves. Nothing moved, nothing is held — a second click on the same toggle
   * is still a click.
   */
  useLayoutEffect(() => {
    const before = beforeSwitch.current
    if (before === undefined) return
    beforeSwitch.current = undefined
    holdIfMovedUnder(before)
    const frame = requestAnimationFrame(() => holdIfMovedUnder(before))
    return () => cancelAnimationFrame(frame)
  }, [editMode, settings.autoSpeak])

  const toggleEditMode = useCallback(() => setMode(editMode ? 'speak' : 'edit'), [editMode, setMode])

  /**
   * The microphone, and the one thing it does to the board besides opening the
   * box above the message.
   *
   * **Opening it turns auto-speak off and holds it off** — the board goes into
   * edit mode, the only other way of working, and the auto-speak control cannot
   * be rested on until the question closes. Asked for: an answer is built out
   * of phrases and suggestions in the box and said when it is ready, rather
   * than each phrase said the moment it is chosen. Speak in edit mode saves as
   * well, so an answer said is kept as a phrase.
   *
   * **Closing it goes back to the mode it opened from** — auto-speak, or edit
   * mode where somebody was already there — with whatever answer was being
   * written carried into the message box as leaving edit mode always carries
   * it. **Auto-speak's control closes it too**, into auto-speak.
   */
  const { open: listening, toggle: toggleMic } = listener
  const { clear: clearMessage } = composer
  /** The mode the board was in when the question opened, which closing it goes back to. */
  const modeBeforeListening = useRef<'speak' | 'edit'>('speak')
  /**
   * Closes the question, into `mode` — the one it opened from, by the
   * microphone, or auto-speak, by auto-speak's own control. The answer being
   * written is carried into the message box, as leaving edit mode always
   * carries it.
   */
  const stopListening = useCallback(
    (mode: 'speak' | 'edit') => {
      if (mode === 'speak' && editMode) setMode('speak')
      // Said in place of what the mode switch says, which it follows.
      flashToast(mode === 'speak' ? 'Stopped listening — auto-speak on' : 'Stopped listening')
      holdDwells()
      toggleMic()
    },
    [editMode, setMode, flashToast, toggleMic],
  )
  const toggleListen = useCallback(() => {
    if (listening) {
      stopListening(modeBeforeListening.current)
      return
    }
    // **A question starts afresh**: the message box is emptied — Undo brings it
    // back — and so is the phrase being written, so the answer is not written
    // onto the end of something else. Please goes: an answer is said as it is.
    modeBeforeListening.current = editMode ? 'edit' : 'speak'
    clearMessage()
    if (editMode) startNew()
    else setMode('edit', false)
    if (settings.please) update({ please: false })
    flashToast('Listening — auto-speak is off until you stop')
    // The question's card opens above the message's on a narrow screen and
    // beside it on a wide one, and either way the message card — and the
    // microphone in its row — moves out from under the pointer that rested on it.
    holdDwells()
    toggleMic()
  }, [
    listening,
    stopListening,
    editMode,
    settings.please,
    setMode,
    clearMessage,
    startNew,
    update,
    toggleMic,
    flashToast,
  ])

  /**
   * **Auto-speak's control, while a question is open, stops listening and turns
   * auto-speak on** — the one way out of answering that also says how to carry
   * on. Otherwise it moves between the two ways of working, as it always has.
   */
  const toggleAutoSpeak = useCallback(() => {
    if (listening) stopListening('speak')
    else toggleEditMode()
  }, [listening, stopListening, toggleEditMode])

  // **Please says it changed**, as every mode does.
  const togglePlease = useCallback(() => {
    update({ please: !settings.please })
    flashToast(settings.please ? 'Please off' : 'Please on — added to everything said')
  }, [settings.please, update, flashToast])

  // Anything part-way through when rest begins would otherwise complete after
  // it, which is the one thing resting is supposed to prevent.
  const toggleRest = useCallback(() => {
    cancelAllDwells()
    setResting(r => !r)
  }, [])

  const sayMessage = useCallback(
    (words: string) => {
      speakMessage(words)
      // Not words off Translations, said again: they are in another language
      // and kept there already, as auto-speak leaves them.
      const filed = saidIn ? undefined : keepSaid(words)
      if (filed) flashToast(filed)
    },
    [speakMessage, keepSaid, saidIn, flashToast],
  )

  /**
   * **Composed before it is said**, as everything that speaks composes: a
   * phrase goes in the box as edit mode shows it, so the box can hold choices
   * still to be made — and those are asked for now, in the picker a phrase
   * chosen in auto-speak opens, and the words said are the ones chosen. What
   * the box holds is left as it was, so the next Speak asks again.
   */
  const handleSpeak = useCallback(() => {
    const words = editMode ? draft.text : message
    if (!words.trim()) return
    // Read as the board reads a phrase, with the user's own lists in it.
    const segments = parseSegments(words, aliasOverlay(board.aliases))
    const plain = segments.some(s => s.kind === 'slot') ? composeWritten(segments) : words
    // **In edit mode, Speak beside Save says the phrase being written and
    // saves it**, as Save would — in the voice chosen for it, and its choices
    // asked for as anywhere else. Where Save would refuse — the words are on
    // the board already — it is only said: Library holds it as it is.
    if (editMode) {
      const voiceURI = draft.voice || undefined
      if (hasChoices(segments)) {
        cancelAllDwells()
        setFilling({
          phrase: { id: 'draft', text: compose(segments), source: words, segments, category: '' },
          then: 'say',
          voiceURI,
        })
      } else speak(plain, settings, { voiceURI, onTranslated: recordTranslated, please: settings.please })
      // Save refuses words Library holds already, so those are only said —
      // and it is that phrase that was said.
      const said = handleSave() ?? phraseSaying(words.trim())?.id
      // **Counted as used, and pointed at once it has been said**, as a message
      // said in auto-speak is — see `keepSaid`. Not counted, a phrase said here
      // sat behind every phrase with any use under Recently used and Most used:
      // the end of the board. Not a button on the emergency bar, which is
      // counted nowhere.
      if (said && !draft.isEmergency) {
        recordUsed(said)
        if (isSpeaking()) pointWhenSaid.current = said
        else setPointWhenShown(said)
      }
      return
    }
    if (hasChoices(segments)) {
      cancelAllDwells()
      setFilling({
        phrase: { id: 'message', text: compose(segments), source: message, segments, category: '' },
        then: 'speak',
      })
      return
    }
    sayMessage(plain)
  }, [
    editMode,
    draft.text,
    draft.voice,
    message,
    sayMessage,
    board.aliases,
    settings,
    recordTranslated,
    handleSave,
    phraseSaying,
    draft.isEmergency,
    recordUsed,
  ])

  // Copying is the other way a message leaves — into a text, an email, someone
  // else's screen. It was still said.
  const handleCopy = useCallback(() => {
    if (!message) return
    copyMessage().then(ok => {
      const filed = ok ? keepSaid(message) : undefined
      flashToast(ok ? `Copied to clipboard${filed ? `. ${filed}` : ''}` : 'Could not copy — clipboard unavailable')
    })
  }, [message, copyMessage, flashToast, keepSaid])

  /**
   * Both text boxes offer a paste, and both can be refused. Reading the clipboard
   * needs permission and, in most browsers, a recent click or key press — and a
   * dwell is a timer firing after a pointer has rested, with no press in it. So
   * the people this app is for are the likeliest to be turned down, and silence
   * would leave the control looking simply broken. The same reasoning as the
   * toast behind a blocked link.
   */
  const reportPaste = useCallback(
    (result: PasteResult) => {
      if (result === 'refused') flashToast('Blocked. Allow clipboard access for Peri to paste')
      else if (result === 'empty') flashToast('Nothing on the clipboard')
    },
    [flashToast],
  )

  // The panel closes onto the restored board, so the result is the first thing
  // the user sees rather than the screen they restored it from.
  const handleRestore = useCallback(
    (next: AppState, message: string) => {
      board.restore(next.store, next.aliases, true)
      update(next.settings)
      setMenuOpen(false)
      flashToast(message)
    },
    [board, update, flashToast],
  )

  // Whether this device has stopped keeping what is changed — see
  // `use-not-keeping.ts` — and the backup built from memory that answers it.
  const { notKeeping, keptInFile, keepInFile } = useNotKeeping(board, settings)

  // A newer Peri than this open copy, offered rather than forced — see
  // `use-new-version.ts`. The built app alone.
  const newVersion = useNewVersion(import.meta.env.PROD)

  // Synchronizing — see `use-synchronized.ts`: the board and the account going
  // to the user's other devices, and what arrives from them landing here.
  const { sync, account, setAccount, picture, choosePicture } = useSynchronized({
    user,
    board,
    settings,
    update,
    replyKey,
    replyKeyAt,
    setReplyKey,
    flashToast,
  })

  // The shipped translations for whichever language the board is spoken in,
  // brought into memory ahead of anybody pressing anything. `translationFor` has
  // to answer synchronously — the emergency bar will not wait on a promise — so
  // the loading happens here rather than at the moment somebody needs it.
  useEffect(() => {
    void loadTranslations(settings.language)
  }, [settings.language])
  /**
   * Peri's own keyboard. An app-level surface rather than anything the message
   * box owns: it types into whatever field has the caret, so it has to outlast
   * a panel opening over the board — the fields in Aliases need it just as much
   * as the message does, and the control that opens it is behind that panel.
   */
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  // Taking the keyboard away in Settings takes away whatever it had open, or a
  // board would be left with four rows of keys and no way to put them down.
  if (keyboardOpen && !settings.keyboard) setKeyboardOpen(false)

  // `editor.open` is stable, which matters: this value reaches every one of a
  // couple of thousand memoised phrase cells.

  /**
   * A cell, or a button on the emergency bar, chosen in edit mode — see
   * `choose` in `use-editor.ts`. A phrase put in at the caret was chosen to be
   * part of what is said, so it is counted as used, as one said is; one opened
   * to be reworded is not, and neither is a translation or an answer, whose ids
   * name nothing on the board.
   *
   * **One found by typing and opened** — on the tab showing, and the first
   * thing in the box — has its cell brought into view, marked, once the search
   * it ended lets the tab back: see `choose`. The tab is read through a ref so
   * this stays stable across tabs, reaching every cell as it does.
   */
  const { choose: chooseForDraft, propose: proposeDraft } = editor
  const onTab = useRef<(id: string) => boolean>(() => false)
  const { phrasesOf } = board
  useEffect(() => {
    onTab.current = id => phrasesOf(effectiveFilter).some(p => p.id === id)
  }, [phrasesOf, effectiveFilter])
  const chooseInEdit = useCallback(
    (phrase: Phrase | null, isEmergency = false) => {
      // **An answer to the question goes in place of whatever was there**, as
      // it does outside edit mode — see `handleSelectPhrase` — and the one
      // taken is what the next question is answered alongside.
      if (phrase?.category === SUGGEST_CATEGORY) {
        const { text, blankAt } = composeWithBlank(phrase.segments)
        proposeDraft(text, blankAt)
        listenerChose(text)
        return
      }
      const into = chooseForDraft(phrase, isEmergency, !!phrase && onTab.current(phrase.id))
      const record = phrase?.category === TRANSLATED_CATEGORY || phrase?.category === SUGGEST_CATEGORY
      if (into === 'inserted' && phrase && !isEmergency && !record) recordUsed(phrase.id)
      if (into === 'found' && phrase) setPointing({ id: phrase.id, movedTo: null })
    },
    [chooseForDraft, proposeDraft, listenerChose, recordUsed],
  )
  /**
   * **While something is being said, nothing answers but Stop** and the
   * emergency bar — see `setSpeakingLock` in `ui/dwell.ts`. Told the moment it
   * starts and stops rather than after a render, so a dwell already filling
   * when the words begin is stopped with them; the board is dimmed to say so.
   */
  useEffect(() => {
    setSpeakingLock(isSpeaking())
    const stop = subscribeSpeaking(setSpeakingLock)
    return () => {
      stop()
      setSpeakingLock(false)
    }
  }, [])

  const editCtx: EditCtxValue = useMemo(() => ({ editMode, openEdit: chooseInEdit }), [editMode, chooseInEdit])

  return (
    <EditCtx.Provider value={editCtx}>
      <RestingContext.Provider value={resting}>
        <div
          className={cx(
            'app',
            editMode && 'edit-mode',
            resting && 'resting',
            keyboardOpen && 'has-keyboard',
            speaking && 'is-speaking',
          )}
        >
          {newVersion.offered && (
            <div className="update-offer" role="status">
              <p>A new version of Peri is ready. Updating reloads Peri, so finish what you are saying first.</p>
              <PanelButton label="Update now" kind="primary" onActivate={newVersion.update} />
              <PanelButton label="Later" kind="plain" onActivate={newVersion.later} />
            </div>
          )}
          {notKeeping && (
            <div className="not-keeping" role="alert">
              <p>
                This device has stopped saving changes. They will be lost when Peri is closed — save a backup now.
              </p>
              <PanelButton
                label={
                  keptInFile === true
                    ? 'Backup saved'
                    : keptInFile === false
                      ? 'Could not save — try again'
                      : 'Save a backup'
                }
                kind="primary"
                onActivate={keepInFile}
              />
            </div>
          )}
          {/* Getting started stands where the box, the tabs and the grid are,
              and the emergency bar stays live below it. **On a wide screen it
              takes the left half and the board works in the right**, so what a
              part says can be tried as it is read. Both wrappers are
              `display: contents` otherwise, so the board's own layout is what
              it always was. */}
          <div className={cx('talk-body', beside && 'is-beside')}>
            {introducing && <Introduction onClose={closeIntroduction} />}
            {(!introducing || beside) && (
              <div className="board-column">
                <Topbar
                  composer={composer}
                  editMode={editMode}
                  onToggleEdit={toggleAutoSpeak}
                  answering={listening}
                  menuOpen={menuOpen}
                  onToggleMenu={() => setMenuOpen(o => !o)}
                  keyboardOpen={keyboardOpen}
                  onToggleKeyboard={() => setKeyboardOpen(o => !o)}
                  resting={resting}
                  onToggleRest={toggleRest}
                  editor={editor}
                  onSavePhrase={handleSave}
                  history={{ undo: history.toUndo, redo: history.toRedo, onUndo: handleUndo, onRedo: handleRedo }}
                  onSpeak={handleSpeak}
                  onCopy={handleCopy}
                  onPasted={reportPaste}
                  listener={listener}
                  onToggleListen={toggleListen}
                  presenting={presenting}
                  onTogglePresenting={togglePresenting}
                  onTogglePlease={togglePlease}
                />

                {/* Hidden while a typed word is narrowing the grid: the tabs would be
              filtering a list that is already filtered by something else. */}
                {!(filterWord && visiblePhrases.length > 0) && (
                  <FilterBar
                    categories={tabs}
                    activeFilter={effectiveFilter}
                    onSelect={chooseTab}
                    onAddCategory={addCategory}
                    onRename={renameCategory}
                    onDelete={askToDeleteCategory}
                    onReorder={board.reorderCategories}
                    onLift={name => flashToast(`Holding ${name} — dwell where it should go`)}
                    hiddenTabs={hiddenTabs}
                    onHide={hideTab}
                    onArrange={arrangeTabs}
                    after={
                      <SortControl
                        sort={phraseSort}
                        // Neither of these is a category. Both are a record in the order it
                        // happened, and that is the whole of what they are for — so the
                        // order is not the user's to change under either.
                        orderFixed={
                          showingTranslated
                            ? 'Translations are always newest first'
                            : showingSuggestions
                              ? 'Answers are in the order they were offered'
                              : undefined
                        }
                        canArrange={canArrange}
                        onChoose={chooseSort}
                      />
                    }
                  />
                )}

                <PhraseGrid
                  phrases={gridPhrases}
                  // A new tab or a new word is a different list; the same phrases in
                  // a new order is not.
                  listKey={`${effectiveFilter}\u0000${filterWord}`}
                  pointing={pointing}
                  peek={peek}
                  emptyMessage={
                    showingTranslated
                      ? 'Nothing translated yet. Set a spoken language in Settings, and what you say in it is kept here.'
                      : showingSuggestions
                        ? listener.heard.asking
                          ? 'Thinking of some answers…'
                          : 'No answers came back. Try asking again.'
                        : undefined
                  }
                  // The wait stands where the answers will, which is the whole reason
                  // the tab appears before they do.
                  busy={showingSuggestions && listener.heard.asking}
                  canArrange={canArrange}
                  narrowed={Boolean(filterWord)}
                  open={
                    draft.isEmergency || !openOnBoard
                      ? null
                      : {
                          ...openOnBoard,
                          pinned,
                          bin: draft.keeping
                            ? `Forget this ${draft.kept}`
                            : removingFrom
                              ? `Take it out of ${removingFrom}`
                              : 'Delete this phrase',
                        }
                  }
                  onDeleteOpen={askToDelete}
                  choosing={choosing}
                  onReorder={editMode ? handleReorderPhrases : undefined}
                  onLift={text => flashToast(`Holding ${text} — dwell where it should go`)}
                  onSelect={handleSelectPhrase}
                />
              </div>
            )}
          </div>

          <EmergencyBar
            phrases={board.emergencyPhrases}
            voiceFor={board.voiceFor}
            open={draft.isEmergency ? openOnBoard : null}
            onDeleteOpen={askToDelete}
            saysInEditMode={editMode && (draft.phrase !== null || draft.text.trim() !== '')}
            onReorder={editMode ? board.reorderEmergency : undefined}
            onLift={text => flashToast(`Holding ${text} — dwell where it should go`)}
            onPeek={setPeek}
            onAdd={addEmergency}
          />

          <TopPanel
            open={menuOpen}
            user={user}
            onClose={() => setMenuOpen(false)}
            onSignOut={onSignOut}
            aliases={board.aliases}
            onAliasesChange={board.changeAliases}
            store={store}
            phrases={boardPhrases}
            categories={backupCategories}
            onRestore={handleRestore}
            sync={sync}
            account={account}
            onAccountChange={setAccount}
            replyKey={replyKey}
            onReplyKeyChange={setReplyKey}
            picture={picture}
            onPictureChange={choosePicture}
            onForgetConversation={forgetConversation}
            onOpenIntroduction={() => {
              setMenuOpen(false)
              setIntroducing(true)
            }}
          />

          {/* Portalled and fixed, so it is above a panel as well as above the
              board — every field in the app is one it has to be able to type
              into, and most of them are inside one. */}
          {keyboardOpen &&
            createPortal(
              <Keyboard onClose={() => setKeyboardOpen(false)} above=".emergency-bar" covers=".grid-area" />,
              document.body,
            )}

          <DwellCursor />

          <BusyIndicator
            busy={board.rebuilding || sync.status === 'working'}
            label={board.rebuilding ? 'Rebuilding the board' : 'Synchronizing'}
          />

          <ToastRegion toast={toast} />

          {filling && (
            <SlotPicker
              phrase={filling.phrase}
              onComplete={(text, _blankAt, choices) => {
                const { phrase, then, voiceURI, keep } = filling
                setFilling(null)
                // Chosen in auto-speak: said as any phrase chosen there is, and
                // the box left holding it as edit mode shows it. Kept as the
                // phrase it came from — filed under the tab showing, as any
                // phrase said there is — and never as these words, a phrase with
                // its choices made being the phrase it came from.
                if (then === 'say') {
                  speak(text, settings, { voiceURI, onTranslated: recordTranslated, please: settings.please })
                  const filed = keep ? keepSaid(phrase.source) : undefined
                  if (filed) flashToast(filed)
                } else sayMessage(composeWritten(phrase.segments, choices))
              }}
              onCancel={() => setFilling(null)}
            />
          )}

          {/* **The bin on the phrase open in the box asks first** — what it
              does depends on where it is: forgets a record, takes a phrase out
              of the category showing, or deletes it. */}
          {askingDelete && draft.phrase && (
            <AskFirst
              title={
                draft.keeping
                  ? `Forget this ${draft.kept}?`
                  : removingFrom
                    ? `Take it out of ${removingFrom}?`
                    : draft.isEmergency
                      ? 'Delete this emergency phrase?'
                      : 'Delete this phrase?'
              }
              note={
                draft.keeping
                  ? 'It comes off the record, and cannot be put back.'
                  : removingFrom
                    ? 'It stays in Library, and in any other category it is in. Undo puts it back.'
                    : draft.isEmergency
                      ? 'It comes off the blue bar. Undo puts it back.'
                      : 'It goes from Library and from every category it is in. Undo puts it back.'
              }
              confirm={draft.keeping ? 'Forget' : removingFrom ? 'Take out' : 'Delete'}
              onConfirm={() => {
                setAskingDelete(false)
                handleDelete()
              }}
              onClose={() => setAskingDelete(false)}
            />
          )}

          {editingCategory !== null && (
            <CategoryModal
              name={editingCategory.name}
              phraseCount={editingCategory.name ? (board.phraseCountByCategory.get(editingCategory.name) ?? 0) : 0}
              existing={allCategories}
              onSave={handleCategorySave}
              onDelete={handleCategoryDelete}
              onClose={() => setEditingCategory(null)}
            />
          )}
          {addingEmergency && (
            <EmergencyModal
              existing={board.emergencyPhrases.map(p => p.source)}
              onSave={saveEmergency}
              onClose={() => setAddingEmergency(false)}
            />
          )}
        </div>
      </RestingContext.Provider>
    </EditCtx.Provider>
  )
}
