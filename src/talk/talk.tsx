// The talking screen.
//
// State lives in four hooks — the board, the message, the phrase being edited,
// and the toast — so what is left here is the screen's own business: which
// category is showing, whether the app is in edit mode or resting, and what to
// say when an operation finishes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadTranslations } from '../core/translation'
import { cancelAllDwells, holdDwellsUntilMoved, RestingContext } from '../ui/dwell'
import { EditCtx, type EditCtxValue } from '../ui/edit-mode'
import { useSettings } from '../ui/settings'
import { compose, composeWithBlank, hasChoices, parseSegments, type Phrase } from '../core/phrases'
import { soleLink } from '../core/markdown'
import { openLink } from '../core/links'
import { search } from '../core/search'
import { sortPhrases } from '../core/sort'
import {
  loadElevenLabs,
  forgetReplyContext,
  loadReplyKey,
  loadPhraseSorts,
  loadRecent,
  sameAccount,
  saveElevenLabs,
  savePhraseSorts,
  saveReplyKey,
  saveRecent,
  setSortFor,
  sortFor,
  type ElevenLabsAccount,
  type PhraseSort,
  type User,
} from '../core/store'
import { applyBackup, buildBackup, type AppState } from '../core/backup'
import { accountId } from '../core/store'
import { SYNC_EPOCH, keepDeviceSettings, portableSettings, type SyncPayload } from '../core/sync'
import { useSync } from '../sync/use-sync'
import { speak, warmVoice } from '../voice/speech'
import { clearAudioCache, setRemoteClips } from '../voice/audio-cache'
import { REMOTE_PREFIX } from '../voice/elevenlabs'
import { cx } from '../ui/style'
import { BusyIndicator, DwellCursor } from '../ui/controls'
import { Keyboard } from '../ui/keyboard'
import { type PasteResult } from '../ui/link-input'
import { Topbar } from './topbar'
import { PhraseGrid } from './grid'
import { FilterBar } from './filter-bar'
import { EmergencyBar } from './emergency'
import { SlotPicker } from './slots'
import { CategoryModal } from './editors'
import { TopPanel } from '../menu/menu'
import { useBoard } from './use-board'
import { useComposer } from './use-composer'
import { useEditor } from './use-editor'
import { SENT_CATEGORY, SENT_FILTER, useSent } from './use-sent'
import { useListen } from './use-listen'
import { TRANSLATED_CATEGORY, TRANSLATED_FILTER, useTranslated, voiceForTranslated } from './use-translated'
import { useUsage } from './use-usage'
import { useToast } from './use-toast'

/** One shared empty arrangement, so a category with none keeps a stable memo. */
const EMPTY_ARRANGEMENT: string[] = []

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
  const [recent, setRecent] = useState(loadRecent)
  // Which of the four orders each tab is in. One per tab rather than one for
  // the board: the categories are not alike, and a single setting makes the
  // right answer for one of them the wrong answer everywhere else.
  const [phraseSorts, setPhraseSorts] = useState(loadPhraseSorts)

  const { store, allCategories, voiceFor } = board

  // The phrase being written, which in edit mode is what the message box holds.
  // There is always one — pointing it at a phrase is what choosing a cell does
  // in edit mode, and there is nothing to open and nothing to close.
  const editor = useEditor({ allCategories, recent, voiceFor, duplicateOf: board.duplicateOf })
  const { draft, startNew } = editor
  // Pulled out rather than reached through `composer`, which is a fresh object
  // every render: a callback depending on the whole of it would change identity
  // on every render too, and `deliverPhrase` reaches the memoised phrase cells.
  const { insert: insertPhrase, text: message, currentWord, copy: copyMessage, speak: speakMessage } = composer

  /**
   * Listen mode: the other half of the conversation — see `use-listen.ts`.
   *
   * A suggested reply is `propose`d rather than set, so whatever was in the
   * message box is one dwell on Undo away. **Nothing here speaks**, whatever
   * mode the board is in.
   */
  const listener = useListen({
    language: settings.language,
    replyKey,
    replyModel: settings.replyModel,
    // Edit mode counts as not empty however little is in the draft: the box is
    // showing a phrase there, and a reply landing in the message behind it
    // would be one nobody could see and an exchange nobody asked to pay for.
    messageEmpty: !editMode && message.trim() === '',
    onSuggest: composer.propose,
  })

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
      ...allCategories.map(c => ({ id: c, label: c })),
      { id: TRANSLATED_FILTER, label: TRANSLATED_CATEGORY, fixed: true },
    ],
    [allCategories],
  )

  // Emergency has no tab of its own, so it would otherwise be the one set of
  // phrases that could not be exported on its own.
  const backupCategories = useMemo(() => [...allCategories, 'Emergency'], [allCategories])

  // Deleting the last phrase in a category takes its tab away; fall back to
  // "All" rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === 'all' ||
    activeFilter === SENT_FILTER ||
    activeFilter === TRANSLATED_FILTER ||
    allCategories.includes(activeFilter)
      ? activeFilter
      : 'all'

  const showingSent = effectiveFilter === SENT_FILTER
  const showingTranslated = effectiveFilter === TRANSLATED_FILTER

  /**
   * Whether this tab is a category of its own: somewhere a hand arrangement can
   * be built, and so somewhere Custom order means anything. None of All, Sent
   * and Translations is one.
   */
  const canArrange = effectiveFilter !== 'all' && !showingSent && !showingTranslated

  /** What this tab is showing. A tab nobody has chosen for shows `DEFAULT_SORT`. */
  const phraseSort = sortFor(phraseSorts, effectiveFilter, canArrange)

  // Sent messages and translations are their own lists rather than part of the
  // board: both are a record of what was said, not phrases anybody added.
  // Only what is being *composed* narrows the grid. In edit mode the box holds a
  // phrase being written, and narrowing the board to a word of it would take
  // away the phrases the user came to edit.
  const filterWord = editMode ? '' : currentWord

  // How often each phrase is used. The board follows it live — see `use-usage.ts`.
  const usage = useUsage()
  // Pulled out for the reason `insertPhrase` is: `handleSelectPhrase` reaches
  // every one of a couple of thousand memoised cells, and a callback depending
  // on the whole of a hook result depends on a fresh object every render.
  const { record: recordUsed, forget: forgetUsed } = usage
  // Pulled out for the same reason: both reach the memoised cells too.
  const { record: recordTranslated, forget: forgetTranslated } = translated

  // Arranged before it is searched, never after. Filtering to a category keeps
  // the order it is given and so does the ranking, so this decides ties within a
  // rank band while a typed word still puts the best match first.
  //
  // The hand arrangement is the shown category's own, and there is none under
  // All: its phrases come from every category at once, and ranking them against
  // each other's arrangements would interleave orders that were never about one
  // another. Applied here rather than after the filter because `sortPhrases`
  // leaves ids it does not know where they were, so the other categories' cells
  // are untouched either way.
  const handArrangement = store.phraseOrder[effectiveFilter] ?? EMPTY_ARRANGEMENT
  const arrangedPhrases = useMemo(
    () => sortPhrases(board.mainPhrases, phraseSort, usage.counts, handArrangement),
    [board.mainPhrases, phraseSort, usage.counts, handArrangement],
  )

  // Both records keep the order they happened in, newest first, and neither is
  // put through `sortPhrases` at all — which is what "always sorted by recency"
  // means for the Translations tab, exactly as it does for Sent.
  const visiblePhrases = useMemo(
    () =>
      showingSent
        ? search(sent.phrases, SENT_CATEGORY, filterWord)
        : showingTranslated
          ? search(translated.phrases, TRANSLATED_CATEGORY, filterWord)
          : search(arrangedPhrases, effectiveFilter, filterWord),
    [
      showingSent,
      showingTranslated,
      sent.phrases,
      translated.phrases,
      arrangedPhrases,
      effectiveFilter,
      filterWord,
    ],
  )

  /**
   * A different arrangement moves every cell on the board at once. The picker
   * holds the dwells on its way out, which is what stops the phrase arriving
   * under a resting pointer being spoken by the change itself.
   */
  // Remembered against the tab it was chosen under, so coming back to a
  // category brings back the order it was left in.
  const chooseSort = useCallback(
    (next: PhraseSort) => {
      const sorts = setSortFor(phraseSorts, effectiveFilter, next)
      savePhraseSorts(sorts)
      setPhraseSorts(sorts)
    },
    [phraseSorts, effectiveFilter],
  )

  /**
   * A move captures the order that was on screen and makes it the user's own,
   * exactly as a category move does — and switches the grid to Custom order,
   * since an arrangement nobody is looking at is not an arrangement.
   *
   * The list handed over is what is actually shown. In edit mode that is the
   * whole category, because a typed word never narrows the grid there.
   */
  const handleReorderPhrases = useCallback(
    (from: string, to: string) => {
      board.reorderPhrases(
        effectiveFilter,
        visiblePhrases.map(p => p.id),
        from,
        to,
      )
      chooseSort('custom')
    },
    [board, effectiveFilter, visiblePhrases, chooseSort],
  )

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
      // Counted here rather than at the speaker, because this is the one place a
      // phrase is *chosen* — whatever it then does, speak, compose or open a
      // link. Edit mode never reaches here: a cell opens the editor instead.
      //
      // Not under Sent or Translations. Those ids name a message or a
      // translation rather than a phrase on the board, so counting them would
      // fill the record with ids that can never match anything and never fall
      // out.
      if (!showingSent && !showingTranslated) {
        recordUsed(phrase.id)
        // Under an order that follows use, the board rearranges on this very
        // dwell, and the pointer is resting on the cell that did it. Nothing may
        // be chosen until the gaze leaves whatever lands underneath.
        if (phraseSort === 'recent' || phraseSort === 'frequent') holdDwellsUntilMoved()
      }
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
    [deliverPhrase, voiceFor, flashToast, showingSent, showingTranslated, recordUsed, phraseSort, settings],
  )

  // ── Editing what is on the board ───────────────────────────────────────────

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

    // Saving a sent message keeps it: it becomes a phrase of the user's own, in
    // a category they pick, rather than editing the record of having said it.
    // The record is left exactly as it was.
    if (phrase === null || keeping) {
      // The id comes back so a brand-new phrase can be given the voice chosen
      // for it — there is no id to hang one on until the phrase exists.
      const id = board.addPhrase(text, category, isEmergency)
      if (voice) board.setVoice(id, voice)
    } else {
      // Fetched and stored the moment it is assigned, so the phrase can be said
      // in that voice without waiting — including on the emergency bar, which
      // never waits.
      board.setVoice(phrase.id, voice)
      board.editPhrase(phrase, text, category, isEmergency)
    }
    startNew()
    flashToast(
      keeping
        ? 'Kept as a phrase'
        : phrase === null
          ? `Added to ${isEmergency ? 'Emergency' : category}`
          : 'Saved',
    )
  }, [draft, board, startNew, flashToast])

  const handleDelete = useCallback(() => {
    const { phrase, keeping } = draft
    if (!phrase) return
    // Forgetting is the only way to take something off either record, and
    // somebody who has just said something private needs one. Which record is
    // read off the phrase itself, since the two tabs share every other part of
    // this path.
    if (keeping) {
      if (phrase.category === TRANSLATED_CATEGORY) forgetTranslated(phrase.id)
      else sent.forget(phrase.id)
    } else {
      board.removePhrase(phrase.id)
      // Its count goes with it, so the record stays the size of the board.
      forgetUsed(phrase.id)
    }
    startNew()
    flashToast(keeping ? 'Forgotten' : 'Deleted')
  }, [draft, board, sent, forgetTranslated, forgetUsed, startNew, flashToast])

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
    board.removeCategory(name)
    setActiveFilter(f => (f === name ? 'all' : f))
    setEditingCategory(null)
  }, [editingCategory, board])

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
   * The two toggles move between them, and each is a toggle rather than a
   * choice: switching auto-speak *off* is a request to change the phrases, so
   * it lands in edit mode, and switching edit off comes back to composing. The
   * three sit in a ring, which is what makes two controls enough for three
   * states without either of them ever doing nothing.
   *
   * Entering edit mode carries whatever is in the message box in with it, so a
   * message worth keeping becomes a phrase without being typed again.
   */
  const setMode = useCallback(
    (mode: 'speak' | 'compose' | 'edit') => {
      update({ autoSpeak: mode === 'speak' })
      setEditMode(mode === 'edit')
      startNew(mode === 'edit' ? message.trim() : '')
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
            ? 'Edit mode — choose a phrase to change it'
            : 'Auto-speak off — phrases build a message',
      )
    },
    [message, startNew, update, flashToast],
  )

  const toggleEditMode = useCallback(() => setMode(editMode ? 'compose' : 'edit'), [editMode, setMode])

  const toggleAutoSpeak = useCallback(
    () => setMode(settings.autoSpeak ? 'edit' : 'speak'),
    [settings.autoSpeak, setMode],
  )

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
      board.restore(next.store, next.aliases)
      update(next.settings)
      setMenuOpen(false)
      flashToast(message)
    },
    [board, update, flashToast],
  )

  // ── Synchronizing ──────────────────────────────────────────────────────────
  // The board as a backup, which is the document sync ships. **A fixed date**,
  // because `buildBackup` stamps the moment it was called and a stamp that moves
  // every render is a board that looks changed every render — which would push
  // for ever. When it was written down is the snapshot's business, not the
  // document's.
  /**
   * The linked account lives here rather than in the settings row that edits it,
   * for two reasons that arrived together: it is part of what synchronizing
   * sends, and a row holding its own copy would go stale the moment a board
   * arrived from another device carrying a different one.
   */
  const [account, setLinkedAccount] = useState<ElevenLabsAccount | null>(loadElevenLabs)

  /**
   * Written straight through, and `speak` reads it back per utterance, so there
   * is no second copy to keep in step. The cache goes with it: audio fetched on
   * one account's credits is not another's to use, and a voice re-linked may
   * well be a different one under the same name.
   *
   * **Writing the same account again is not a change**, and the guard is here
   * rather than at the one caller that needs it today. A board arriving from
   * another device carries the account whether or not that is what changed, so
   * without this an edit to a phrase on the tablet would empty the phone's audio
   * cache — every clip re-fetched, on the user's own credits, for nothing. It is
   * the sort of cost that never shows up as a bug report.
   */
  const setAccount = useCallback((next: ElevenLabsAccount | null) => {
    if (sameAccount(next, loadElevenLabs())) return
    saveElevenLabs(next)
    clearAudioCache()
    // A remembered voice from the account that has just gone would seed the next
    // new phrase with one that no longer exists.
    if (next === null) {
      const recent = loadRecent()
      if (recent.voice?.startsWith(REMOTE_PREFIX)) saveRecent({ ...recent, voice: undefined })
    }
    setLinkedAccount(next)
  }, [])

  const syncBackup = useMemo(
    () =>
      buildBackup({
        store,
        aliases: board.aliases,
        // Text size and volume are about this screen and this speaker, not about
        // the person — so they are blanked on the way out, which also means
        // turning the text size up is not a change to the board at all. See
        // `portableSettings`.
        settings: portableSettings(settings),
        categoryById: board.categoryById,
        now: SYNC_EPOCH,
      }),
    [store, board.aliases, settings, board.categoryById],
  )

  /** Everything sync carries: the board, and what a backup file may not hold. */
  const syncPayload = useMemo(() => ({ backup: syncBackup, account, replyKey }), [syncBackup, account, replyKey])

  // A board that arrived from another device lands exactly as a restored backup
  // does — in one go, with a line saying where it came from, because a grid that
  // rearranges itself under somebody with no explanation is alarming.
  const applyFromSync = useCallback(
    (incoming: SyncPayload, from: string) => {
      const next = applyBackup(incoming.backup, { store, aliases: board.aliases, settings }, 'replace')
      board.restore(next.store, next.aliases)
      // Everything the person set, and this device's own text size and volume.
      update(keepDeviceSettings(next.settings, settings))
      // The account travels with the board, which is what makes a phrase given
      // an ElevenLabs voice on one device still sound like itself on the next.
      // `setAccount` ignores one that has not changed — see there.
      setAccount(incoming.account)
      // And the key behind a suggested reply, for the same reason: it is what
      // makes the feature work on the second device without forty characters of
      // noise being typed into it by dwell.
      setReplyKey(incoming.replyKey)
      flashToast(`Board updated from your other device (${from})`)
    },
    [board, store, settings, update, flashToast, setAccount, setReplyKey],
  )

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

  const sync = useSync({
    accountId: accountId(user),
    payload: syncPayload,
    onApply: applyFromSync,
  })

  /**
   * Tells the audio cache where the user's other devices keep their clips.
   *
   * **Here because this is the only place that can see both.** `voice/` and
   * `sync/` sit on the same line of the layering, so neither may import the
   * other, and a clip an ElevenLabs voice is about to be billed for is decided
   * deep inside the first while the address it might already be at is worked out
   * by the second. Null while synchronizing is off, which is where the app
   * ships — and put back to null on the way out, or a signed-out screen would
   * leave a stale set of keys installed in a module.
   */
  useEffect(() => {
    setRemoteClips(sync.clips)
    return () => setRemoteClips(null)
  }, [sync.clips])

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
            onSpeak={handleSpeak}
            onCopy={handleCopy}
            onPasted={reportPaste}
            listener={listener}
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
              onSelect={setActiveFilter}
              onEditCategory={editMode ? openCategory : undefined}
              onAddCategory={editMode ? () => openCategory(null) : undefined}
              reordering={editMode && reordering}
              isAlphabetical={store.categorySort === 'alpha'}
              canRestoreOrder={store.categoryOrder.length > 0}
              onToggleReorder={editMode ? () => setReordering(r => !r) : undefined}
              onToggleSort={editMode ? handleToggleSort : undefined}
              onReorder={editMode ? board.reorderCategories : undefined}
              onLift={name => flashToast(`Holding ${name} — dwell where it should go`)}
            />
          )}

          <PhraseGrid
            phrases={visiblePhrases}
            // A new tab or a new word is a different list; the same phrases in
            // a new order is not.
            listKey={`${effectiveFilter}\u0000${filterWord}`}
            emptyMessage={
              showingSent
                ? 'Nothing said yet. Messages you speak or copy are kept here.'
                : showingTranslated
                  ? 'Nothing translated yet. Set a spoken language in Settings, and what you say in it is kept here.'
                  : undefined
            }
            sort={phraseSort}
            // Neither of these is a category. Both are a record in the order it
            // happened, newest first, and that is the whole of what they are
            // for — so the order is not the user's to change under either.
            orderFixed={
              showingSent
                ? 'Sent messages are always newest first'
                : showingTranslated
                  ? 'Translations are always newest first'
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
            categories={backupCategories}
            categoryById={board.categoryById}
            onRestore={handleRestore}
            sync={sync}
            account={account}
            onAccountChange={setAccount}
            replyKey={replyKey}
            onReplyKeyChange={setReplyKey}
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
