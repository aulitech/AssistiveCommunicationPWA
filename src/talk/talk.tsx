// The talking screen.
//
// State lives in four hooks — the board, the message, the phrase being edited,
// and the toast — so what is left here is the screen's own business: which
// category is showing, whether the app is in edit mode or resting, and what to
// say when an operation finishes.

import { useCallback, useMemo, useState } from 'react'
import { cancelAllDwells, RestingContext } from '../ui/dwell'
import { EditCtx, type EditCtxValue } from '../ui/edit-mode'
import { useSettings } from '../ui/settings'
import { compose, composeWithBlank, hasChoices, parseSegments, type Phrase } from '../core/phrases'
import { soleLink } from '../core/markdown'
import { openLink } from '../core/links'
import { search } from '../core/search'
import { loadRecent, saveRecent, type User } from '../core/store'
import { type AppState } from '../core/backup'
import { speak, warmVoice } from '../voice/speech'
import { cx } from '../ui/style'
import { DwellCursor } from '../ui/controls'
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
import { useToast } from './use-toast'

export function TalkScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { settings, update } = useSettings()
  const board = useBoard()
  const composer = useComposer()
  const sent = useSent()
  const { toast, flashToast } = useToast()

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [editMode, setEditMode] = useState(false)
  // Two reorder modes, one for each bar. Sharing a flag would mean arming the
  // emergency bar every time somebody set about tidying their category tabs.
  const [reordering, setReordering] = useState(false)
  const [reorderingEmergency, setReorderingEmergency] = useState(false)
  const [resting, setResting] = useState(false)
  // `forDraft` marks a category being invented from inside the phrase editor,
  // which files the phrase under it as well as creating it.
  const [editingCategory, setEditingCategory] = useState<{ name: string | null; forDraft?: boolean } | null>(
    null,
  )
  const [filling, setFilling] = useState<Phrase | null>(null)
  const [recent, setRecent] = useState(loadRecent)

  const { store, allCategories, voiceFor } = board

  // The phrase being written, which in edit mode is what the message box holds.
  // There is always one — pointing it at a phrase is what choosing a cell does
  // in edit mode, and there is nothing to open and nothing to close.
  const editor = useEditor({ allCategories, recent, voiceFor, duplicateOf: board.duplicateOf })
  const { draft, startNew } = editor
  // Pulled out rather than reached through `composer`, which is a fresh object
  // every render: a callback depending on the whole of it would change identity
  // on every render too, and `deliverPhrase` reaches the memoised phrase cells.
  const { insert: insertPhrase, text: message, currentWord, copy: copyMessage, speak: speakMessage } =
    composer

  // Derived from the live phrase list so user-added categories get a tab and
  // fully-hidden categories lose theirs.
  const tabs = useMemo(
    () => [
      // Neither of these is a category: they cannot be renamed, and the custom
      // order cannot move them out of the two places a user learns to look.
      { id: SENT_FILTER, label: SENT_CATEGORY, fixed: true },
      { id: 'all', label: 'All', fixed: true },
      ...allCategories.map(c => ({ id: c, label: c })),
    ],
    [allCategories],
  )

  // Emergency has no tab of its own, so it would otherwise be the one set of
  // phrases that could not be exported on its own.
  const backupCategories = useMemo(() => [...allCategories, 'Emergency'], [allCategories])

  // Deleting the last phrase in a category takes its tab away; fall back to
  // "All" rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === 'all' || activeFilter === SENT_FILTER || allCategories.includes(activeFilter)
      ? activeFilter
      : 'all'

  const showingSent = effectiveFilter === SENT_FILTER

  // Sent messages are their own list rather than part of the board: they are a
  // record of what was said, not phrases anybody added.
  // Only what is being *composed* narrows the grid. In edit mode the box holds a
  // phrase being written, and narrowing the board to a word of it would take
  // away the phrases the user came to edit.
  const filterWord = editMode ? '' : currentWord

  const visiblePhrases = useMemo(
    () =>
      showingSent
        ? search(sent.phrases, SENT_CATEGORY, filterWord)
        : search(board.mainPhrases, effectiveFilter, filterWord),
    [showingSent, sent.phrases, board.mainPhrases, effectiveFilter, filterWord],
  )

  // ── Choosing a phrase ──────────────────────────────────────────────────────

  /**
   * Where a chosen phrase goes. In auto-speak it is spoken on the spot and the
   * message box is left alone, so the grid works as a one-tap talker; otherwise
   * it is composed into the message for the user to send when ready.
   */
  const deliverPhrase = useCallback(
    (phraseText: string, voiceURI?: string, blankAt = -1) => {
      // In auto-speak the phrase is the message — it is spoken and never
      // reaches the box, so this is the moment it counts as said.
      if (settings.autoSpeak) {
        speak(phraseText, settings, { voiceURI })
        sent.record(phraseText)
      } else {
        insertPhrase(phraseText, blankAt)
      }
    },
    [settings, insertPhrase, sent],
  )

  const handleSelectPhrase = useCallback(
    (phrase: Phrase) => {
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
      deliverPhrase(phrase.text, voiceFor(phrase.id), blankAt)
    },
    [deliverPhrase, voiceFor, flashToast],
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
      keeping ? 'Kept as a phrase' : phrase === null ? `Added to ${isEmergency ? 'Emergency' : category}` : 'Saved',
    )
  }, [draft, board, startNew, flashToast])

  const handleDelete = useCallback(() => {
    const { phrase, keeping } = draft
    if (!phrase) return
    // Forgetting a message is the only way to take something off that list, and
    // somebody who has just said something private needs one.
    if (keeping) sent.forget(phrase.id)
    else board.removePhrase(phrase.id)
    startNew()
    flashToast(keeping ? 'Forgotten' : 'Deleted')
  }, [draft, board, sent, startNew, flashToast])

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

  const toggleEditMode = useCallback(
    () => setMode(editMode ? 'compose' : 'edit'),
    [editMode, setMode],
  )

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

  // `editor.open` is stable, which matters: this value reaches every one of a
  // couple of thousand memoised phrase cells.
  const editCtx: EditCtxValue = useMemo(
    () => ({ editMode, openEdit: editor.open }),
    [editMode, editor.open],
  )

  const countFor = useCallback(
    (name: string) => board.phraseCountByCategory.get(name) ?? 0,
    [board.phraseCountByCategory],
  )

  return (
    <EditCtx.Provider value={editCtx}>
      <RestingContext.Provider value={resting}>
        <div className={cx('app', editMode && 'edit-mode', resting && 'resting')}>
          <Topbar
            composer={composer}
            editMode={editMode}
            onToggleEdit={toggleEditMode}
            autoSpeak={settings.autoSpeak}
            onToggleAutoSpeak={toggleAutoSpeak}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(o => !o)}
            resting={resting}
            onToggleRest={toggleRest}
            editor={editor}
            onSavePhrase={handleSave}
            onDeletePhrase={handleDelete}
            onSpeak={handleSpeak}
            onCopy={handleCopy}
            onPasted={reportPaste}
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
            emptyMessage={
              showingSent ? 'Nothing said yet. Messages you speak or copy are kept here.' : undefined
            }
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
          />

          <DwellCursor />

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
              phraseCount={
                editingCategory.name ? (board.phraseCountByCategory.get(editingCategory.name) ?? 0) : 0
              }
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


