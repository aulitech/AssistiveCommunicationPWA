// The talking screen.
//
// State lives in four hooks — the board, the message, the phrase being edited,
// and the toast — so what is left here is the screen's own business: which
// category is showing, whether the app is in edit mode or resting, and what to
// say when an operation finishes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadTranslations } from '../core/translation'
import { cancelAllDwells, holdDwellsUntilMoved, RestingContext } from '../ui/dwell'
import { EditCtx, type EditCtxValue } from '../ui/edit-mode'
import { useSettings } from '../ui/settings'
import { compose, composeWithBlank, hasChoices, parseSegments, type Phrase } from '../core/phrases'
import { soleLink, stripMarkdown } from '../core/markdown'
import { openLink } from '../core/links'
import {
  forgetReplyContext,
  loadReplyKey,
  loadRecent,
  saveReplyKey,
  saveRecent,
  type PhraseUse,
  type User,
} from '../core/store'
import { type AppState } from '../core/backup'
import { speak, warmVoice } from '../voice/speech'
import { cx } from '../ui/style'
import { BusyIndicator, DwellCursor, PanelButton } from '../ui/controls'
import { Keyboard } from '../ui/keyboard'
import { type PasteResult } from '../ui/link-input'
import { Topbar } from './topbar'
import { PhraseGrid } from './grid'
import { FilterBar } from './filter-bar'
import { EmergencyBar } from './emergency'
import { SlotPicker } from './slots'
import { CategoryModal } from './editors'
import { TopPanel } from '../menu/menu'
import { useBoard, type Removed } from './use-board'
import { useComposer } from './use-composer'
import { useEditor } from './use-editor'
import { SENT_CATEGORY, SENT_FILTER, useSent } from './use-sent'
import { useListen } from './use-listen'
import { TRANSLATED_CATEGORY, TRANSLATED_FILTER, useTranslated, voiceForTranslated } from './use-translated'
import { SUGGEST_CATEGORY, SUGGEST_FILTER } from './suggestions'
import { useApologies } from './use-apologies'
import { useSynchronized } from './use-synchronized'
import { useNotKeeping } from './use-not-keeping'
import { useGridOrder } from './use-grid-order'
import { useUsage } from './use-usage'
import { useToast } from './use-toast'

export function TalkScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { settings, update } = useSettings()
  const board = useBoard()
  const sent = useSent()
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
  const setReplyKey = useCallback((next: string) => {
    if (next === loadReplyKey()) return
    saveReplyKey(next)
    // Taking the key away takes today's conversation with it. What is left
    // otherwise is a transcript of what somebody was asked, kept on behalf of a
    // feature they have just switched off.
    if (!next) forgetReplyContext()
    setStoredReplyKey(next)
  }, [])

  const { toast, flashToast } = useToast()

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [editMode, setEditMode] = useState(false)
  // Three reorder modes, one for each surface that can be arranged. Sharing a
  // flag would mean arming the bar somebody speaks with every time they set
  // about tidying their category tabs.
  const [reordering, setReordering] = useState(false)
  const [reorderingEmergency, setReorderingEmergency] = useState(false)
  const [reorderingPhrases, setReorderingPhrases] = useState(false)
  const [resting, setResting] = useState(false)
  // `forDraft` marks a category being invented from inside the phrase editor,
  // which files the phrase under it as well as creating it.
  const [editingCategory, setEditingCategory] = useState<{ name: string | null; forDraft?: boolean } | null>(null)
  const [filling, setFilling] = useState<Phrase | null>(null)
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
  const [pointing, setPointing] = useState<{ id: string; movedTo: string | null } | null>(null)
  /**
   * The last phrase deleted, and everything the delete took — see `Removed` in
   * `use-board.ts`. Offered back in the slot at the box's lower left, the one
   * that starts a new phrase, while the draft is still the blank the delete
   * left behind; anything written or opened after it takes the offer away.
   */
  const [lastDeleted, setLastDeleted] = useState<{ phrase: Phrase; removed: Removed; use?: PhraseUse } | null>(
    null,
  )
  const [recent, setRecent] = useState(loadRecent)

  const { store, allCategories, voiceFor, phraseSaying } = board

  // The phrase being written, which in edit mode is what the message box holds.
  // There is always one — pointing it at a phrase is what choosing a cell does
  // in edit mode, and there is nothing to open and nothing to close.
  const editor = useEditor({ allCategories, recent, voiceFor, duplicateOf: board.duplicateOf })
  const { draft, startNew, open: openPhrase } = editor
  // Anything written or opened after a delete takes the offer to undo it away:
  // the blank the bin left is the only draft a phrase can be put back into
  // without writing over something. Adjusted during render — state following
  // state — so no frame shows an undo that would do that.
  if (lastDeleted && !editor.isUntouched) setLastDeleted(null)
  // Pulled out rather than reached through `composer`, which is a fresh object
  // every render: a callback depending on the whole of it would change identity
  // on every render too, and `deliverPhrase` reaches the memoised phrase cells.
  const {
    insert: insertPhrase,
    propose: proposeMessage,
    text: message,
    typed,
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
   * **Said, and not otherwise treated as anything.** It goes nowhere near the
   * Sent list, counts towards no phrase, and is not in the conversation the
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
    // Edit mode counts as not empty however little is in the draft: the box is
    // showing a phrase there, and a reply landing in the message behind it
    // would be one nobody could see and an exchange nobody asked to pay for.
    messageEmpty: !editMode && message.trim() === '',
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
      // None of the three is a category: they cannot be renamed, and the custom
      // order cannot move them out of the places a user learns to look. Two are
      // pinned at the front and one at the very end — Translations is the tab
      // nobody reaches for mid-sentence, and it is the one tab whose cells are
      // not in the language the rest of the board is written in.
      { id: SENT_FILTER, label: SENT_CATEGORY, fixed: true },
      { id: 'all', label: 'All', fixed: true },
      // Third, from the first question answered on: the most recent answers
      // stay until newer ones replace them, and somebody may want to go back to
      // one after the box is closed. Sent and All keep the places they are
      // found in without looking; what gives way is the first category.
      ...(offering ? [{ id: SUGGEST_FILTER, label: SUGGEST_CATEGORY, fixed: true }] : []),
      ...allCategories.map(c => ({ id: c, label: c })),
      { id: TRANSLATED_FILTER, label: TRANSLATED_CATEGORY, fixed: true },
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
   * back to the tab they were on rather than to All, a category they had chosen
   * being where they were working.
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
  const backupCategories = useMemo(() => [...allCategories, 'Emergency'], [allCategories])

  // Deleting the last phrase in a category takes its tab away; fall back to
  // "All" rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === 'all' ||
    activeFilter === SENT_FILTER ||
    activeFilter === TRANSLATED_FILTER ||
    (activeFilter === SUGGEST_FILTER && offering) ||
    allCategories.includes(activeFilter)
      ? activeFilter
      : 'all'

  const showingSent = effectiveFilter === SENT_FILTER
  const showingTranslated = effectiveFilter === TRANSLATED_FILTER
  const showingSuggestions = effectiveFilter === SUGGEST_FILTER

  // The answers landing, or coming back after a request that failed: twenty
  // cells where the waiting line was, under a gaze that has not moved.
  useEffect(() => {
    if (showingSuggestions && listener.suggestions.length) holdDwellsUntilMoved()
  }, [showingSuggestions, listener.suggestions])

  /**
   * Whether this tab is a category of its own: somewhere a hand arrangement can
   * be built, and so somewhere Custom order means anything. None of All, Sent
   * and Translations is one.
   */
  const canArrange = effectiveFilter !== 'all' && !showingSent && !showingTranslated && !showingSuggestions

  // Sent messages and translations are their own lists rather than part of the
  // board: both are a record of what was said, not phrases anybody added.
  /**
   * Only what is being *composed* narrows the grid. In edit mode the box holds a
   * phrase being written, and narrowing the board to a word of it would take
   * away the phrases the user came to edit.
   *
   * **The answers are not narrowed either**, and for a sharper version of the
   * same reason: they are alternatives to one question rather than completions
   * of a word, and choosing one puts its words in the box — so the word at the
   * caret would be a word of the answer they just took, and the other nineteen
   * would disappear at the moment somebody wanted to compare them.
   */
  const filterWord = editMode || showingSuggestions ? '' : typed

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

  // What order the grid is in, and what it shows — see `use-grid-order.ts`.
  const { phraseSort, visiblePhrases, chooseSort, handleReorderPhrases } = useGridOrder({
    board,
    tab: effectiveFilter,
    canArrange,
    showingSent,
    showingTranslated,
    showingSuggestions,
    sentPhrases: sent.phrases,
    translatedPhrases: translated.phrases,
    suggestions: listener.suggestions,
    counts: usage.counts,
    filterWord,
  })

  // ── Choosing a phrase ──────────────────────────────────────────────────────

  /**
   * Where a chosen phrase goes. In auto-speak it is spoken on the spot and the
   * message box is left alone, so the grid works as a one-tap talker; otherwise
   * it is composed into the message for the user to send when ready.
   */
  const deliverPhrase = useCallback(
    (phraseText: string, voiceURI?: string, blankAt = -1, alreadyIn?: string) => {
      // In auto-speak the phrase is the message — it is spoken and never
      // reaches the box, so this is the moment it counts as said.
      if (settings.autoSpeak) {
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
        })
        sent.record(phraseText)
      } else {
        insertPhrase(phraseText, blankAt)
      }
    },
    [settings, insertPhrase, sent, recordTranslated],
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
      // phrase is *chosen* — whatever it then does, speak, compose or open a
      // link. Edit mode never reaches here: a cell opens the editor instead.
      //
      // Not under Sent, Translations or the answers. Those ids name a message,
      // a translation or something a model offered a minute ago rather than a
      // phrase on the board, so counting them would fill the record with ids
      // that can never match anything and never fall out.
      if (!showingSent && !showingTranslated && !showingSuggestions) recordUsed(phrase.id)
      // **Composing moves the board**: the phrase goes into the box, and the
      // grid narrows to the word at the caret, under a pointer resting on the
      // cell that did it. Nothing may be chosen until the gaze is aimed
      // somewhere else. Auto-speak moves nothing, and neither does the order
      // any more — see `ranking` above.
      if (!settings.autoSpeak) holdDwellsUntilMoved()
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
      // Fill-in-the-blank phrases ask for their wording first.
      if (hasChoices(phrase.segments)) {
        cancelAllDwells()
        setFilling(phrase)
        return
      }
      // Recomposed rather than read off the phrase, for the offset alone — a
      // blank has no characters to find in `phrase.text` any more.
      const { blankAt } = composeWithBlank(phrase.segments)
      // A translated cell carries the language it is in, and is said in the
      // voice that was chosen while the board spoke it.
      deliverPhrase(
        phrase.text,
        phrase.lang ? voiceForTranslated(settings, phrase.lang) : voiceFor(phrase.id),
        blankAt,
        phrase.lang,
      )
    },
    [
      deliverPhrase,
      voiceFor,
      flashToast,
      showingSent,
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
   * Where the next new phrase goes.
   *
   * Two things say so: saving one, and opening edit mode on a category — see
   * `setMode`. Written down as well as held, for the reason the rest of
   * `peri_recent` is, and left alone where it already says that, so going in
   * and out of edit mode on one tab is not a write every time.
   */
  const fileUnder = useCallback((category: string) => {
    setRecent(current => {
      if (current.category === category) return current
      const next = { ...current, category }
      saveRecent(next)
      return next
    })
  }, [])

  /**
   * Where the board has to go to put a phrase in front of somebody, or null
   * where it is in front of them already.
   *
   * **All shows every category at once**, so a phrase filed anywhere is on it
   * already and moving would only take somebody off the tab they chose. The
   * three pinned records are not categories and show none of it, so those move
   * like any other tab.
   */
  const moveToShow = useCallback(
    (category: string) => (effectiveFilter !== 'all' && effectiveFilter !== category ? category : null),
    [effectiveFilter],
  )

  /**
   * A tab somebody dwelled on.
   *
   * **In edit mode, a blank draft follows it** — the rule entering edit mode on
   * a category already follows, applied to arriving at one. Tabs go to their
   * category in edit mode now, and somebody moving between them before they
   * write anything is looking for where the next phrase goes. A draft with
   * anything in it stays where it is: words written, or a category picked, and
   * refiling it would move a phrase somebody had already started.
   */
  const chooseTab = useCallback(
    (tab: string) => {
      setActiveFilter(tab)
      if (editMode && editor.isUntouched && allCategories.includes(tab)) fileUnder(tab)
    },
    [editMode, editor.isUntouched, allCategories, fileUnder],
  )

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
  const handleSave = useCallback(() => {
    if (!draft.canSave) return
    const { phrase, isEmergency, category, keeping } = draft
    const text = draft.text.trim()
    const voice = draft.voice || undefined

    // Warmed against what the phrase reads as, not what it is written as: the
    // editor holds the source, and nobody wants a clip of somebody reading
    // "open curly bracket, quote, red, quote" aloud.
    if (voice) void warmVoice(compose(parseSegments(text)), voice)
    // Where the next one starts from.
    setRecent(current => {
      const next = { category: isEmergency ? current.category : category, voice }
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
     * **All** the phrase is already there, the **emergency bar** is on screen
     * under every tab, and a phrase being **reworded** is one somebody is
     * moving out of where they are — refiling several out of one category is a
     * run they would be thrown out of after the first.
     */
    const movesTo = making && !isEmergency ? moveToShow(category) : null

    if (making) {
      // The id comes back so a brand-new phrase can be given the voice chosen
      // for it — there is no id to hang one on until the phrase exists.
      const id = board.addPhrase(text, category, isEmergency)
      if (voice) board.setVoice(id, voice)
      // Which cell it is, for the board to point at — see `pointing`.
      // Nothing for the emergency bar, whose phrases are never in the grid and
      // are on screen under every tab anyway.
      setPointing(isEmergency ? null : { id, movedTo: movesTo })
    } else {
      // Fetched and stored the moment it is assigned, so the phrase can be said
      // in that voice without waiting — including on the emergency bar, which
      // never waits.
      board.setVoice(phrase.id, voice)
      board.editPhrase(phrase, text, category, isEmergency)
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
          ? `Added to ${isEmergency ? 'Emergency' : category}`
          : 'Saved',
    )
  }, [draft, board, startNew, flashToast, moveToShow, showTab])

  const handleDelete = useCallback(() => {
    const { phrase, keeping } = draft
    if (!phrase) return
    // Forgetting is the only way to take something off either record, and
    // somebody who has just said something private needs one. Which record is
    // read off the phrase itself, since the two tabs share every other part of
    // this path.
    if (keeping) {
      if (phrase.category === TRANSLATED_CATEGORY) forgetTranslated(phrase.id)
      else if (phrase.category === SUGGEST_CATEGORY) forgetSuggestion(phrase.id)
      else sent.forget(phrase.id)
    } else {
      const removed = board.removePhrase(phrase.id)
      // Its count goes with it, so the record stays the size of the board —
      // kept here instead, until nobody can ask for the phrase back.
      const use = forgetUsed(phrase.id)
      setLastDeleted({ phrase, removed, use })
    }
    startNew()
    flashToast(keeping ? 'Forgotten' : 'Deleted — undo is at the lower left')
  }, [draft, board, sent, forgetTranslated, forgetSuggestion, forgetUsed, startNew, flashToast])

  /**
   * Put back the phrase just deleted, **as it was**: on the board where it
   * was, with its count, and open in the box, which is where it was when the
   * bin took it — an undo that left somebody to find it again would be half of
   * one. It takes the mark and the scroll a phrase just made takes.
   */
  const handleUndoDelete = useCallback(() => {
    if (!lastDeleted) return
    const { phrase, removed, use } = lastDeleted
    board.restorePhrase(removed)
    if (use) restoreUsed(phrase.id, use)
    openPhrase(phrase, phrase.category === 'Emergency')
    setPointing({ id: phrase.id, movedTo: null })
    setLastDeleted(null)
    flashToast('Put back')
  }, [lastDeleted, board, restoreUsed, openPhrase, flashToast])

  // ── Editing the categories ─────────────────────────────────────────────────

  const openCategory = useCallback((name: string | null) => {
    cancelAllDwells()
    setEditingCategory({ name })
  }, [])

  /** From inside the editor's category grid, which also files the phrase there. */
  const openCategoryForDraft = useCallback(() => {
    cancelAllDwells()
    setEditingCategory({ name: null, forDraft: true })
  }, [])

  const handleCategorySave = useCallback(
    (name: string) => {
      const current = editingCategory?.name ?? null
      if (current === null) {
        board.addCategory(name)
        // Invented from the editor: the phrase in the box goes into it, which
        // is the whole reason it was invented.
        if (editingCategory?.forDraft) editor.setCategory(name)
      } else {
        board.renameCategoryTo(current, name)
        setActiveFilter(f => (f === current ? name : f))
      }
      setEditingCategory(null)
    },
    [editingCategory, board, editor],
  )

  const handleCategoryDelete = useCallback(() => {
    const name = editingCategory?.name
    if (!name) return
    const count = board.phraseCountByCategory.get(name) ?? 0
    board.removeCategory(name)
    setActiveFilter(f => (f === name ? 'all' : f))
    // The box must not go on holding a phrase that has just gone, where Save
    // would write to it, nor filing new words under a category that is not
    // there. What was typed into a new one is kept; it only needs a home.
    if (draft.phrase?.category === name) startNew()
    else if (draft.category === name) {
      if (draft.phrase) openPhrase(draft.phrase, draft.isEmergency)
      else startNew(draft.text)
    }
    setEditingCategory(null)
    flashToast(count > 0 ? `Deleted ${name} and its ${count} phrase${count === 1 ? '' : 's'}` : `Deleted ${name}`)
  }, [editingCategory, board, draft, startNew, openPhrase, flashToast])

  // The tabs land where the pointer is either way, and the control that sorted
  // them looks the same in both states, so both have to be said out loud.
  const handleToggleSort = useCallback(() => {
    const now = board.toggleSort()
    flashToast(now === 'alpha' ? 'Categories sorted A–Z' : 'Your own category order restored')
  }, [board, flashToast])

  // ── Modes ──────────────────────────────────────────────────────────────────

  /**
   * What a dwell on a phrase means. Three answers, and never more than one:
   *
   *  * **speak** — it is said this instant. The board is a talker, and this is
   *    where it starts, so opening the app for the first time is enough to be
   *    able to say something.
   *  * **compose** — it goes into the message box, to be part of a sentence
   *    built out of several.
   *  * **edit** — it comes into the box to be reworded.
   *
   * **Switching one on switches the other off; switching one off leaves the
   * other alone.** Speaking and rewording ask opposite things of the same
   * dwell, so the board cannot be in both at once — but *not speaking* is not a
   * request to start rewording. Auto-speak off used to land in edit mode, which
   * put somebody who only wanted to build a sentence out of several phrases
   * into the one mode where a dwell changes the board.
   *
   * Neither control ever does nothing, and every state is now one dwell from
   * the other two rather than two dwells from the one across the ring —
   * auto-speak to composing was the pair somebody uses most and the pair that
   * was furthest apart.
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
   * board goes and finds it: a message box holding one phrase, as it does the
   * moment one is chosen while composing, is somebody pointing at that phrase
   * — and what they got was a copy of it filed wherever they happened to be,
   * which cannot be saved and says only *Already on the board*. Now the cell
   * itself is marked and brought into view, under its own tab, and **the
   * editor opens on the phrase rather than on a copy of it**: the box holds
   * what the phrase was written as, its own category and voice are what the
   * strip shows, and Save saves it. Anything else is a dwell spent on finding
   * again the cell the board has just finished pointing at.
   */
  const setMode = useCallback(
    (mode: 'speak' | 'compose' | 'edit') => {
      update({ autoSpeak: mode === 'speak' })
      setEditMode(mode === 'edit')
      // A delete is undone in edit mode or not at all: coming back to a blank
      // draft later is not coming back to the moment after the bin.
      setLastDeleted(null)
      const carried = mode === 'edit' ? message.trim() : ''
      // Asked about the tab in front of them as well, which is what decides it
      // where the same wording is filed under more than one category.
      const already = carried ? phraseSaying(carried, effectiveFilter) : undefined
      // The phrase itself, or a new one carrying whatever was composed. What
      // the box shows changes with it — the phrase's **source**, brackets and
      // markup and all, rather than the one filling of it that was said.
      if (already) openPhrase(already)
      else startNew(carried)
      if (already) {
        // **Including off All**, unlike a phrase just saved, and the difference
        // is the question being answered. A save's is *did it go, and where* —
        // which the toast answers, and All was already showing it. This one's
        // is *which category is this phrase in*, and All is the one tab that
        // cannot answer it, since not showing categories is the whole of what
        // it is for.
        const movedTo = already.category === effectiveFilter ? null : already.category
        if (movedTo) showTab(movedTo)
        setPointing({ id: already.id, movedTo })
      }
      // Its category if there is one, since that is where the next phrase
      // belongs too — otherwise the tab, and **only where the tab is a
      // category.** Four of them are not: All, and the three pinned records,
      // Sent, the answers and Translations. Nothing can be filed under any of
      // those, so they leave the last choice standing rather than throwing it
      // away and asking again.
      const filing = already?.category ?? (allCategories.includes(effectiveFilter) ? effectiveFilter : null)
      if (mode === 'edit' && filing) fileUnder(filing)
      // Reordering is a mode within edit mode; leaving it should not leave
      // either of them armed for next time.
      setReordering(false)
      setReorderingEmergency(false)
      setReorderingPhrases(false)
      // The lit toggle is the only other cue, and it is a 1.5rem icon in a
      // strip — say plainly which of the three the board is now in.
      flashToast(
        mode === 'speak'
          ? 'Auto-speak on — phrases speak immediately'
          : mode === 'edit'
            ? // Which is not the phrase they last said but the one they were
              // holding, and the box now holds it as it was written.
              already
              ? `Editing this phrase, in ${already.category}`
              : 'Edit mode — choose a phrase to change it'
            : 'Auto-speak off — phrases build a message',
      )
    },
    [
      message,
      startNew,
      openPhrase,
      update,
      flashToast,
      allCategories,
      effectiveFilter,
      fileUnder,
      phraseSaying,
      showTab,
    ],
  )

  const toggleEditMode = useCallback(() => setMode(editMode ? 'compose' : 'edit'), [editMode, setMode])

  const toggleAutoSpeak = useCallback(
    () => setMode(settings.autoSpeak ? 'compose' : 'speak'),
    [settings.autoSpeak, setMode],
  )

  /**
   * The microphone, and the one thing it does to the board besides opening the
   * box above the message.
   *
   * **Opening it puts the board in auto-speak.** Somebody has just been spoken
   * to and is about to answer, with a person waiting in front of them — which
   * is the whole of what auto-speak is for, and the alternative is a board that
   * hears a question and then wants a second dwell somewhere else before it can
   * say anything back. It is the same bargain the automatic asking strikes: the
   * dwell it saves is the point.
   *
   * **Only on the way in.** Closing the box leaves the mode exactly as it is,
   * because a conversation that has ended is not a reason to stop talking — and
   * because a control that undid itself on the way out would take away a mode
   * somebody had chosen in the middle of one.
   *
   * It takes the board out of edit mode as a consequence, those two never being
   * on together. That is right rather than incidental: a question in the room
   * is not a moment to be rewriting phrases, and what it costs is the blank
   * draft that dwelling on auto-speak itself would have cost.
   */
  const { open: listening, toggle: toggleMic } = listener
  const toggleListen = useCallback(() => {
    if (!listening && !settings.autoSpeak) setMode('speak')
    toggleMic()
  }, [listening, settings.autoSpeak, setMode, toggleMic])

  // Anything part-way through when rest begins would otherwise complete after
  // it, which is the one thing resting is supposed to prevent.
  const toggleRest = useCallback(() => {
    cancelAllDwells()
    setResting(r => !r)
  }, [])

  const handleSpeak = useCallback(() => {
    if (!message.trim()) return
    speakMessage()
    sent.record(message)
  }, [message, speakMessage, sent])

  // Copying is the other way a message leaves — into a text, an email, someone
  // else's screen. It was still said.
  const handleCopy = useCallback(() => {
    if (!message) return
    copyMessage().then(ok => {
      flashToast(ok ? 'Copied to clipboard' : 'Could not copy — clipboard unavailable')
      if (ok) sent.record(message)
    })
  }, [message, copyMessage, flashToast, sent])

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

  // Synchronizing — see `use-synchronized.ts`: the board and the account going
  // to the user's other devices, and what arrives from them landing here.
  const { sync, account, setAccount } = useSynchronized({
    user,
    board,
    settings,
    update,
    replyKey,
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

  const editCtx: EditCtxValue = useMemo(() => ({ editMode, openEdit: editor.open }), [editMode, editor.open])

  const countFor = useCallback(
    (name: string) => board.phraseCountByCategory.get(name) ?? 0,
    [board.phraseCountByCategory],
  )

  return (
    <EditCtx.Provider value={editCtx}>
      <RestingContext.Provider value={resting}>
        <div className={cx('app', editMode && 'edit-mode', resting && 'resting', keyboardOpen && 'has-keyboard')}>
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
          <Topbar
            composer={composer}
            editMode={editMode}
            onToggleEdit={toggleEditMode}
            autoSpeak={settings.autoSpeak}
            onToggleAutoSpeak={toggleAutoSpeak}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(o => !o)}
            keyboardOpen={keyboardOpen}
            onToggleKeyboard={() => setKeyboardOpen(o => !o)}
            resting={resting}
            onToggleRest={toggleRest}
            editor={editor}
            onSavePhrase={handleSave}
            onDeletePhrase={handleDelete}
            undoDelete={lastDeleted && { words: stripMarkdown(lastDeleted.phrase.text), undo: handleUndoDelete }}
            onSpeak={handleSpeak}
            onCopy={handleCopy}
            onPasted={reportPaste}
            listener={listener}
            onToggleListen={toggleListen}
            categories={allCategories}
            countFor={countFor}
            onCreateCategory={openCategoryForDraft}
          />

          {/* Hidden while a typed word is narrowing the grid: the tabs would be
              filtering a list that is already filtered by something else. */}
          {!(filterWord && visiblePhrases.length > 0) && (
            <FilterBar
              categories={tabs}
              activeFilter={effectiveFilter}
              onSelect={chooseTab}
              onEditCategory={editMode ? openCategory : undefined}
              onAddCategory={editMode ? () => openCategory(null) : undefined}
              reordering={editMode && reordering}
              isAlphabetical={store.categorySort === 'alpha'}
              canRestoreOrder={store.categoryOrder.length > 0}
              onToggleReorder={editMode ? () => setReordering(r => !r) : undefined}
              onToggleSort={editMode ? handleToggleSort : undefined}
              onReorder={editMode ? board.reorderCategories : undefined}
              onLift={name => flashToast(`Holding ${name} — dwell where it should go`)}
              pointing={pointing}
            />
          )}

          <PhraseGrid
            phrases={visiblePhrases}
            // A new tab or a new word is a different list; the same phrases in
            // a new order is not.
            listKey={`${effectiveFilter}\u0000${filterWord}`}
            pointing={pointing}
            emptyMessage={
              showingSent
                ? 'Nothing said yet. Messages you speak or copy are kept here.'
                : showingTranslated
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
            sort={phraseSort}
            // Neither of these is a category. Both are a record in the order it
            // happened, newest first, and that is the whole of what they are
            // for — so the order is not the user's to change under either.
            orderFixed={
              showingSent
                ? 'Sent messages are always newest first'
                : showingTranslated
                  ? 'Translations are always newest first'
                  : showingSuggestions
                    ? 'Answers are in the order they were offered'
                    : undefined
            }
            canArrange={canArrange}
            onChooseSort={chooseSort}
            reordering={editMode && reorderingPhrases}
            onToggleReorder={editMode ? () => setReorderingPhrases(r => !r) : undefined}
            onReorder={editMode ? handleReorderPhrases : undefined}
            onLift={text => flashToast(`Holding ${text} — dwell where it should go`)}
            onSelect={handleSelectPhrase}
          />

          <EmergencyBar
            phrases={board.emergencyPhrases}
            voiceFor={board.voiceFor}
            reordering={editMode && reorderingEmergency}
            onToggleReorder={editMode ? () => setReorderingEmergency(r => !r) : undefined}
            onReorder={editMode ? board.reorderEmergency : undefined}
            onLift={text => flashToast(`Holding ${text} — dwell where it should go`)}
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
            categoryById={board.categoryById}
            onRestore={handleRestore}
            sync={sync}
            account={account}
            onAccountChange={setAccount}
            replyKey={replyKey}
            onReplyKeyChange={setReplyKey}
            onForgetConversation={forgetConversation}
          />

          {/* Portalled and fixed, so it is above a panel as well as above the
              board — every field in the app is one it has to be able to type
              into, and most of them are inside one. */}
          {keyboardOpen && createPortal(<Keyboard onClose={() => setKeyboardOpen(false)} />, document.body)}

          <DwellCursor />

          <BusyIndicator
            busy={board.rebuilding || sync.status === 'working'}
            label={board.rebuilding ? 'Rebuilding the board' : 'Synchronizing'}
          />

          <div className="toast-region" role="status" aria-live="polite">
            {toast && <div className="toast">{toast}</div>}
          </div>

          {filling && (
            <SlotPicker
              phrase={filling}
              onComplete={(text, blankAt) => {
                setFilling(null)
                // A phrase can have both kinds: options to pick from, and a
                // blank to type into. The caret goes to whatever is left.
                deliverPhrase(text, voiceFor(filling.id), blankAt)
              }}
              onCancel={() => setFilling(null)}
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
        </div>
      </RestingContext.Provider>
    </EditCtx.Provider>
  )
}
