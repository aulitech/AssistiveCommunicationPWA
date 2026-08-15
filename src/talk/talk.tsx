// The talking screen.
//
// State lives in three hooks — the board, the message, and the toast — so what
// is left here is the screen's own business: which dialog is open, which
// category is showing, whether the app is in edit mode or resting, and what to
// say when an operation finishes.

import { useCallback, useMemo, useState } from 'react'
import { cancelAllDwells, RestingContext } from '../ui/dwell'
import { EditCtx, type EditCtxValue } from '../ui/edit-mode'
import { useSettings } from '../ui/settings'
import { composeWithBlank, hasChoices, type Phrase } from '../core/phrases'
import { search } from '../core/search'
import { loadRecent, saveRecent, type User } from '../core/store'
import { type AppState } from '../core/backup'
import { speak, warmVoice } from '../voice/speech'
import { cx } from '../ui/style'
import { DwellCursor } from '../ui/controls'
import { Topbar } from './topbar'
import { PhraseGrid } from './grid'
import { FilterBar } from './filter-bar'
import { EmergencyBar } from './emergency'
import { SlotPicker } from './slots'
import { CategoryModal, EditModal } from './editors'
import { TopPanel } from '../menu/menu'
import { useBoard } from './use-board'
import { useComposer } from './use-composer'
import { SENT_CATEGORY, SENT_FILTER, useSent } from './use-sent'
import { useToast } from './use-toast'

/** Which phrase the editor is open on, if any. `phrase: null` means a new one. */
interface Editing {
  phrase: Phrase | null
  isEmergency: boolean
  /** Seeds a new phrase — the composed message, when adding from the message box. */
  initialText?: string
}

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
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editingCategory, setEditingCategory] = useState<{ name: string | null } | null>(null)
  const [filling, setFilling] = useState<Phrase | null>(null)
  const [recent, setRecent] = useState(loadRecent)

  const { store, allCategories, voiceFor } = board
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
  const visiblePhrases = useMemo(
    () =>
      showingSent
        ? search(sent.phrases, SENT_CATEGORY, currentWord)
        : search(board.mainPhrases, effectiveFilter, currentWord),
    [showingSent, sent.phrases, board.mainPhrases, effectiveFilter, currentWord],
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
    [deliverPhrase, voiceFor],
  )

  // ── Editing what is on the board ───────────────────────────────────────────

  const openEdit = useCallback((phrase: Phrase | null, isEmergency = false) => {
    cancelAllDwells()
    setEditing({ phrase, isEmergency })
  }, [])

  const editingSent = editing?.phrase?.category === SENT_CATEGORY

  // Adding from the message box carries whatever is composed there into the
  // editor, so a message worth keeping becomes a phrase without retyping it.
  // Deliberately not routed through `openEdit`: that one is on the edit context
  // every phrase cell reads, and making it depend on the message would
  // re-render the whole grid on each keystroke.
  const openAddFromComposer = useCallback(() => {
    cancelAllDwells()
    setEditing({ phrase: null, isEmergency: false, initialText: message.trim() })
  }, [message])

  const handleSave = useCallback(
    (text: string, category: string, voice: string | undefined) => {
      if (!editing) return
      const { phrase, isEmergency } = editing
      // Fetched and stored the moment it is assigned, so the phrase can be said
      // in that voice without waiting — including on the emergency bar, which
      // never waits.
      if (phrase) board.setVoice(phrase.id, voice)
      if (voice) void warmVoice(text, voice)
      // Where the next one starts from.
      setRecent(current => {
        const next = { category: isEmergency ? current.category : category, voice }
        saveRecent(next)
        return next
      })
      // Saving a sent message keeps it: it becomes a phrase of the user's own,
      // in a category they pick, rather than editing the record of having said
      // it. The record is left exactly as it was.
      if (phrase === null || phrase.category === SENT_CATEGORY) board.addPhrase(text, category, isEmergency)
      else board.editPhrase(phrase, text, category, isEmergency)
      setEditing(null)
    },
    [editing, board],
  )

  const handleDelete = useCallback(() => {
    if (!editing?.phrase) return
    // Forgetting a message is the only way to take something off this list, and
    // somebody who has just said something private needs one.
    if (editing.phrase.category === SENT_CATEGORY) sent.forget(editing.phrase.id)
    else board.removePhrase(editing.phrase.id)
    setEditing(null)
  }, [editing, board, sent])

  // ── Editing the categories ─────────────────────────────────────────────────

  const openCategory = useCallback((name: string | null) => {
    cancelAllDwells()
    setEditingCategory({ name })
  }, [])

  const handleCategorySave = useCallback(
    (name: string) => {
      const current = editingCategory?.name ?? null
      if (current === null) {
        board.addCategory(name)
      } else {
        board.renameCategoryTo(current, name)
        setActiveFilter(f => (f === current ? name : f))
      }
      setEditingCategory(null)
    },
    [editingCategory, board],
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

  const toggleEditMode = useCallback(() => {
    setEditMode(m => !m)
    // Reordering is a mode within edit mode; leaving the outer one should not
    // leave either of them armed for next time.
    setReordering(false)
    setReorderingEmergency(false)
  }, [])

  const toggleAutoSpeak = useCallback(() => {
    const next = !settings.autoSpeak
    update({ autoSpeak: next })
    // The button's lit state is the only other cue, and it sits in a narrow
    // rail — say plainly which way the mode just went.
    flashToast(next ? 'Auto-speak on — phrases speak immediately' : 'Auto-speak off — phrases build a message')
  }, [settings.autoSpeak, update, flashToast])

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

  // The panel closes onto the restored board, so the result is the first thing
  // the user sees rather than the screen they restored it from.
  const handleRestore = useCallback(
    (next: AppState, message: string) => {
      board.restore(next.store, next.profile)
      update(next.settings)
      setMenuOpen(false)
      flashToast(message)
    },
    [board, update, flashToast],
  )

  const editCtx: EditCtxValue = useMemo(() => ({ editMode, openEdit }), [editMode, openEdit])

  return (
    <EditCtx.Provider value={editCtx}>
      <RestingContext.Provider value={resting}>
        <div className={cx('app', editMode && 'edit-mode', resting && 'resting')}>
          <Topbar
            composer={composer}
            editMode={editMode}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(o => !o)}
            resting={resting}
            onToggleRest={toggleRest}
            onAddPhrase={openAddFromComposer}
            onSpeak={handleSpeak}
            onCopy={handleCopy}
          />

          {/* Hidden while a typed word is narrowing the grid: the tabs would be
              filtering a list that is already filtered by something else. */}
          {!(currentWord && visiblePhrases.length > 0) && (
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
            editMode={editMode}
            onToggleEdit={toggleEditMode}
            autoSpeak={settings.autoSpeak}
            onToggleAutoSpeak={toggleAutoSpeak}
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
            profile={board.profile}
            onProfileChange={board.changeProfile}
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

          {editing !== null && (
            <EditModal
              phrase={editing.phrase}
              isEmergency={editing.isEmergency}
              initialText={editing.initialText}
              allCategories={allCategories}
              voice={editing.phrase ? voiceFor(editing.phrase.id) : undefined}
              recent={recent}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setEditing(null)}
              keeping={editingSent}
            />
          )}
        </div>
      </RestingContext.Provider>
    </EditCtx.Provider>
  )
}


