// The talking screen: the message being composed, the grid it is composed from,
// and every way of changing what is in that grid.
//
// State lives in three hooks rather than here — the phrase store and its
// mutations, the message and its history, and the toast — so that this file is
// what the screen is made of rather than how it is wired.

import { useCallback, useMemo, useRef, useState } from 'react'
import { cancelAllDwells, RestingContext, useDwellControl } from './dwell'
import { speak } from './speech'
import { EditCtx, type EditCtxValue } from './edit-mode'
import { useSettings } from './settings'
import {
  BLANK,
  EMERGENCY_PHRASES,
  buildPhrases,
  compose,
  hasChoices,
  parseSegments,
  type Phrase,
  type Profile,
} from './phrases'
import {
  displayCategory,
  loadPhraseStore,
  loadProfile,
  moveCategory,
  orderCategories,
  renameCategory,
  saveProfile,
  savePhraseStore,
  type PhraseStore,
  type User,
} from './store'
import { type AppState } from './backup'
import { ClearIcon, CopyIcon, MenuIcon, SpeakIcon, UndoIcon } from './icons'
import { cx, dwellVar } from './style'
import { DwellCursor } from './ui'
import { ActionButton, RestButton } from './topbar'
import { GridScrollBar, PhraseCell } from './grid'
import { FilterBar } from './filter-bar'
import { EmergencyBar } from './emergency'
import { SlotPicker } from './slots'
import { CategoryModal, EditModal } from './editors'
import { TopPanel } from './menu'

export function TalkScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { settings, update } = useSettings()
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [cursorPos, setCursorPos] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [store, setStore] = useState<PhraseStore>(loadPhraseStore)
  const [profile, setProfile] = useState<Profile>(loadProfile)
  const [editing, setEditing] = useState<
    { phrase: Phrase | null; isEmergency: boolean; initialText?: string } | null
  >(null)
  const [editingCategory, setEditingCategory] = useState<{ name: string | null } | null>(null)
  const [filling, setFilling] = useState<Phrase | null>(null)
  const [composerFocused, setComposerFocused] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [resting, setResting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gridRef = useRef<HTMLElement>(null)
  const showUndo = !text && history.length > 0

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => {
      const next = { ...s, ...patch }
      savePhraseStore(next)
      return next
    })
  }, [])

  const flashToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(t => (t === message ? null : t)), 2200)
  }, [])

  // Overrides and user-authored phrases are re-parsed, so they behave like any
  // other phrase — and keep their stored id, which is what delete matches on.
  const buildPhrase = useCallback((id: string, raw: string, category: string): Phrase => {
    const segments = parseSegments(raw)
    return { id, text: compose(segments), segments, category }
  }, [])

  const handleProfileChange = useCallback((next: Profile) => {
    saveProfile(next)
    setProfile(next)
  }, [])

  // Slot options are resolved at parse time, so the table is rebuilt when the
  // user's own details change — a few milliseconds, and only on a profile edit.
  const tablePhrases = useMemo(() => buildPhrases(profile), [profile])

  const mainPhrases = useMemo(() => {
    // A phrase moved individually keeps that category; otherwise it follows any
    // rename applied to the category it came in.
    const shown = (id: string, source: string) =>
      store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames)
    const base = tablePhrases
      .filter(p => !store.hidden.includes(p.id))
      .map(p =>
        store.overrides[p.id]
          ? buildPhrase(p.id, store.overrides[p.id], shown(p.id, p.category))
          : { ...p, category: shown(p.id, p.category) },
      )
    const custom = store.custom
      .filter(c => c.category !== 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, shown(c.id, c.category)))
    return [...base, ...custom]
  }, [store, buildPhrase, tablePhrases])

  const emergencyPhrases = useMemo(() => {
    const base = EMERGENCY_PHRASES
      .filter(p => !store.hidden.includes(p.id))
      .map(p => (store.overrides[p.id] ? buildPhrase(p.id, store.overrides[p.id], p.category) : p))
    const custom = store.custom
      .filter(c => c.category === 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, 'Emergency'))
    return [...base, ...custom]
  }, [store, buildPhrase])

  const allCategories = useMemo(
    // User-created categories are listed even while empty, so one can be made
    // first and filled afterwards.
    () =>
      orderCategories(
        [...new Set([...mainPhrases.map(p => p.category), ...store.categories])],
        // The custom arrangement is kept while A–Z is showing; it just is not
        // the one being applied.
        store.categorySort === 'custom' ? store.categoryOrder : [],
      ),
    [mainPhrases, store.categories, store.categoryOrder, store.categorySort],
  )

  // The category every phrase belongs to, hidden ones included. Exporting a few
  // categories needs a category for phrases that are not on screen: one the user
  // removed still belongs to the category it came from, and that is the only way
  // to tell whether their removal is part of what they asked to export.
  const categoryById = useMemo(() => {
    const map = new Map<string, string>()
    const shown = (id: string, source: string) =>
      store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames)
    for (const p of tablePhrases) map.set(p.id, shown(p.id, p.category))
    for (const p of EMERGENCY_PHRASES) map.set(p.id, 'Emergency')
    for (const c of store.custom) map.set(c.id, shown(c.id, c.category))
    return map
  }, [tablePhrases, store.categoryOverrides, store.categoryRenames, store.custom])

  const phraseCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of mainPhrases) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return counts
  }, [mainPhrases])

  // Derived from the live phrase list so user-added categories get a tab and
  // fully-hidden categories lose theirs.
  const categories = useMemo(
    () => [{ id: 'all', label: 'All' }, ...allCategories.map(c => ({ id: c, label: c }))],
    [allCategories],
  )

  const backupCategories = useMemo(() => [...allCategories, 'Emergency'], [allCategories])

  // Deleting the last phrase in a category takes its tab away; fall back to
  // "All" rather than showing an empty grid under a tab that no longer exists.
  const effectiveFilter =
    activeFilter === 'all' || allCategories.includes(activeFilter) ? activeFilter : 'all'

  const openCategory = useCallback((name: string | null) => {
    cancelAllDwells()
    setEditingCategory({ name })
  }, [])

  const handleCategorySave = useCallback(
    (name: string) => {
      const current = editingCategory?.name ?? null
      if (current === null) {
        updateStore({ categories: [...new Set([...store.categories, name])] })
      } else {
        updateStore(renameCategory(store, current, name))
        setActiveFilter(f => (f === current ? name : f))
      }
      setEditingCategory(null)
    },
    [editingCategory, store, updateStore],
  )

  const handleCategoryDelete = useCallback(() => {
    const name = editingCategory?.name
    if (!name) return
    updateStore({
      categories: store.categories.filter(c => c !== name),
      categoryOrder: store.categoryOrder.filter(c => c !== name),
    })
    setActiveFilter(f => (f === name ? 'all' : f))
    setEditingCategory(null)
  }, [editingCategory, store, updateStore])

  // A drag or a drop writes the whole arrangement, so a move made while A–Z is
  // showing captures the order the user could see at the time — and replaces
  // whatever they had arranged before, which is what building a new one means.
  const handleReorder = useCallback(
    (from: string, to: string) =>
      updateStore({ categoryOrder: moveCategory(allCategories, from, to), categorySort: 'custom' }),
    [allCategories, updateStore],
  )

  // One control, toggling between the two arrangements. The custom one is left
  // in the store either way, so going to A–Z and back is not a way to lose it.
  const handleToggleSort = useCallback(() => {
    const toAlpha = store.categorySort === 'custom'
    updateStore({ categorySort: toAlpha ? 'alpha' : 'custom' })
    flashToast(toAlpha ? 'Categories sorted A–Z' : 'Your own category order restored')
  }, [store.categorySort, updateStore, flashToast])

  // An import lands in one go rather than a field at a time: the three stores
  // are written together and the panel closes onto the result, so there is no
  // moment where the grid is showing half of someone's backup.
  const handleRestore = useCallback(
    (next: AppState, message: string) => {
      updateStore(next.store)
      handleProfileChange(next.profile)
      update(next.settings)
      setMenuOpen(false)
      flashToast(message)
    },
    [updateStore, handleProfileChange, update, flashToast],
  )

  const openEdit = useCallback((phrase: Phrase | null, isEmergency = false) => {
    cancelAllDwells()
    setEditing({ phrase, isEmergency })
  }, [])

  // Adding from the message box carries whatever is composed there into the
  // editor, so a message worth keeping becomes a phrase without retyping it.
  // Deliberately not routed through `openEdit`: that one is on the edit context
  // every phrase cell reads, and making it depend on `text` would re-render the
  // whole grid on each keystroke.
  const openAddFromComposer = useCallback(() => {
    cancelAllDwells()
    setEditing({ phrase: null, isEmergency: false, initialText: text.trim() })
  }, [text])

  const handleSave = useCallback(
    (newText: string, newCategory: string) => {
      if (!editing) return
      const { phrase, isEmergency } = editing
      if (phrase === null) {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        updateStore({
          custom: [...store.custom, { id, text: newText, category: isEmergency ? 'Emergency' : newCategory }],
          categories: isEmergency ? store.categories : [...new Set([...store.categories, newCategory])],
        })
      } else {
        const patch: Partial<PhraseStore> = {
          overrides: { ...store.overrides, [phrase.id]: newText },
        }
        // The editor has always shown a category for existing phrases; until
        // now, changing it was silently discarded.
        if (!isEmergency && newCategory && newCategory !== phrase.category) {
          patch.categoryOverrides = { ...store.categoryOverrides, [phrase.id]: newCategory }
          patch.categories = [...new Set([...store.categories, newCategory])]
        }
        updateStore(patch)
      }
      setEditing(null)
    },
    [editing, store, updateStore],
  )

  const handleDelete = useCallback(() => {
    if (!editing?.phrase) return
    const id = editing.phrase.id
    if (id.startsWith('custom-')) {
      updateStore({ custom: store.custom.filter(p => p.id !== id) })
    } else {
      updateStore({ hidden: [...store.hidden, id] })
    }
    setEditing(null)
  }, [editing, store, updateStore])

  const editCtx: EditCtxValue = useMemo(() => ({ editMode, openEdit }), [editMode, openEdit])

  // Word immediately left of cursor
  const currentWord = useMemo(() => {
    const before = text.slice(0, cursorPos)
    return before.match(/\S+$/)?.[0] ?? ''
  }, [text, cursorPos])

  const visiblePhrases = useMemo(() => {
    const pool =
      effectiveFilter === 'all' ? mainPhrases : mainPhrases.filter(p => p.category === effectiveFilter)
    const q = currentWord.toLowerCase()
    if (!q) return pool

    const score = (phrase: string): number => {
      const p = phrase.toLowerCase()
      if (p.startsWith(q)) return 3
      const words = p.split(/\s+/)
      if (words.some(w => w.startsWith(q))) return 2
      let qi = 0
      for (const w of words) {
        if (qi < q.length && w[0] === q[qi]) qi++
      }
      return qi === q.length ? 1 : 0
    }

    return pool
      .map(p => ({ p, s: score(p.text) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.p)
  }, [effectiveFilter, currentWord, mainPhrases])

  const trackCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos(e.currentTarget.selectionStart ?? 0)
  }, [])

  /** Replace the partial word left of the cursor with `phraseText`. */
  const insertPhrase = useCallback(
    (phraseText: string) => {
      const el = textareaRef.current
      const pos = el?.selectionStart ?? text.length
      const before = text.slice(0, pos)
      const after = text.slice(pos)
      const stripped = before.replace(/\S+$/, '')
      const separator = stripped.length > 0 && !stripped.endsWith(' ') ? ' ' : ''
      const inserted = stripped + separator + phraseText
      const newText = inserted + (after.startsWith(' ') || after === '' ? '' : ' ') + after

      setHistory(h => [...h, text])
      setText(newText)

      // Land the cursor on the first unfilled blank if there is one, so it can be
      // typed over; otherwise sit at the end of what was just inserted.
      const blankAt = inserted.indexOf(BLANK, stripped.length)
      setTimeout(() => {
        if (el) {
          if (blankAt >= 0) {
            el.selectionStart = blankAt
            el.selectionEnd = blankAt + BLANK.length
            el.focus()
          } else {
            el.selectionStart = el.selectionEnd = inserted.length
          }
        }
        setCursorPos(blankAt >= 0 ? blankAt : inserted.length)
      }, 0)
    },
    [text],
  )

  /**
   * Where a chosen phrase goes. In auto-speak it is spoken on the spot and the
   * message box is left alone, so the grid works as a one-tap talker; otherwise
   * it is composed into the message for the user to send when ready.
   */
  const deliverPhrase = useCallback(
    (phraseText: string) => {
      if (settings.autoSpeak) speak(phraseText, settings)
      else insertPhrase(phraseText)
    },
    [settings, insertPhrase],
  )

  const handleSelectPhrase = useCallback(
    (phrase: Phrase) => {
      // Fill-in-the-blank phrases ask for their wording first.
      if (hasChoices(phrase.segments)) {
        cancelAllDwells()
        setFilling(phrase)
        return
      }
      deliverPhrase(phrase.text)
    },
    [deliverPhrase],
  )

  const handleClearOrUndo = useCallback(() => {
    if (text) {
      setHistory(h => [...h, text])
      setText('')
    } else if (history.length) {
      setText(history[history.length - 1])
      setHistory(h => h.slice(0, -1))
    }
  }, [text, history])

  const handleCopy = useCallback(() => {
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => flashToast('Copied to clipboard'))
      .catch(() => flashToast('Could not copy — clipboard unavailable'))
  }, [text, flashToast])

  const handleSpeak = useCallback(() => speak(text, settings), [text, settings])

  const toggleAutoSpeak = useCallback(() => {
    const next = !settings.autoSpeak
    update({ autoSpeak: next })
    // The button's lit state is the only other cue, and it sits in a narrow
    // rail — say plainly which way the mode just went.
    flashToast(next ? 'Auto-speak on — phrases speak immediately' : 'Auto-speak off — phrases build a message')
  }, [settings.autoSpeak, update, flashToast])

  const toggleMenu = useCallback(() => setMenuOpen(o => !o), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Anything part-way through when rest begins would otherwise complete after
  // it, which is the one thing resting is supposed to prevent.
  const toggleRest = useCallback(() => {
    cancelAllDwells()
    setResting(r => !r)
  }, [])

  // Hover-and-hold on the message box, doing whichever of its two jobs applies.
  // Both were previously reachable only by clicking — the one input a
  // dwell-only user cannot produce.
  //
  //  * In edit mode it opens the editor; adding an ordinary phrase has no other
  //    entry point.
  //  * Otherwise it moves focus there, so the caret can be placed and typed at
  //    without a click.
  const handleComposerDwell = useCallback(() => {
    if (editMode) openAddFromComposer()
    else textareaRef.current?.focus()
  }, [editMode, openAddFromComposer])

  // Once the box holds focus there is nothing left for a hold to do, so it
  // stops arming — a pointer resting there while the user types should not keep
  // lighting up a progress bar.
  const composerDwell = useDwellControl(settings.actionDwellMs, handleComposerDwell, {
    disabled: !editMode && composerFocused,
  })

  return (
    <EditCtx.Provider value={editCtx}>
     <RestingContext.Provider value={resting}>
      <div className={cx('app', editMode && 'edit-mode', resting && 'resting')}>
        {/* ── Topbar ── */}
        <header className="topbar">
          {/* Straddling the top edge of the message box — the middle of the
              screen's top, where a gaze on its way anywhere passes. Costs the
              grid no height at all. */}
          <RestButton resting={resting} onToggle={toggleRest} />

          <ActionButton label={menuOpen ? 'Close menu' : 'Open menu'} onSelect={toggleMenu} className="menu-btn">
            <MenuIcon />
          </ActionButton>

          <ActionButton
            className="left"
            onSelect={handleClearOrUndo}
            label={showUndo ? 'Undo' : 'Clear'}
            disabled={!text && !history.length}
          >
            {showUndo ? <UndoIcon /> : <ClearIcon />}
          </ActionButton>

          <textarea
            ref={textareaRef}
            className={cx('text-display', composerDwell.active && 'dwelling')}
            style={dwellVar(settings.actionDwellMs)}
            aria-label={
              editMode
                ? text.trim()
                  ? 'Add this message as a new phrase'
                  : 'Add a new phrase'
                : 'Composed message'
            }
            value={text}
            onChange={e => {
              setText(e.target.value)
              trackCursor(e)
            }}
            onSelect={trackCursor}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onPointerEnter={composerDwell.props.onPointerEnter}
            onPointerLeave={composerDwell.props.onPointerLeave}
            onClick={e => {
              trackCursor(e)
              if (editMode) composerDwell.props.onClick()
            }}
            // The handler cancels Space so it cannot scroll the grid, and the
            // hook's own disabled check already stops that outside edit mode —
            // but that check reads a ref synced in an effect, and this is the
            // one surface where swallowing a space is unacceptable.
            onKeyDown={editMode ? composerDwell.props.onKeyDown : undefined}
            onKeyUp={trackCursor}
            placeholder={
              editMode
                ? 'Hold here to add a new phrase…'
                : settings.autoSpeak
                  ? 'Auto-speak is on — phrases are spoken, not collected here'
                  : 'Dwell on a phrase or type…'
            }
            rows={1}
            spellCheck
            autoCapitalize="sentences"
            readOnly={editMode}
          />

          <ActionButton className="right" onSelect={handleSpeak} label="Speak" disabled={!text}>
            <SpeakIcon />
          </ActionButton>

          <ActionButton className="right" onSelect={handleCopy} label="Copy to clipboard" disabled={!text}>
            <CopyIcon />
          </ActionButton>
        </header>

        {/* ── Filter bar — hidden while text search is active ── */}
        {!(currentWord && visiblePhrases.length > 0) && (
          <FilterBar
            categories={categories}
            activeFilter={effectiveFilter}
            onSelect={setActiveFilter}
            onEditCategory={editMode ? openCategory : undefined}
            onAddCategory={editMode ? () => openCategory(null) : undefined}
            reordering={editMode && reordering}
            isAlphabetical={store.categorySort === 'alpha'}
            canRestoreOrder={store.categoryOrder.length > 0}
            onToggleReorder={editMode ? () => setReordering(r => !r) : undefined}
            onToggleSort={editMode ? handleToggleSort : undefined}
            onReorder={editMode ? handleReorder : undefined}
            onLift={name => flashToast(`Holding ${name} — dwell where it should go`)}
          />
        )}

        {/* ── Phrase grid + scroll controls ── */}
        <div className="grid-area">
          <main ref={gridRef} className="grid-wrapper">
            <div className="phrase-grid" role="group" aria-label="Phrases">
              {visiblePhrases.map(phrase => (
                <PhraseCell key={phrase.id} phrase={phrase} onSelect={handleSelectPhrase} />
              ))}
            </div>
          </main>
          <GridScrollBar
            gridRef={gridRef}
            editMode={editMode}
            onToggleEdit={() => {
              setEditMode(m => !m)
              // Reordering is a mode within edit mode; leaving the outer one
              // should not leave it armed for next time.
              setReordering(false)
            }}
            autoSpeak={settings.autoSpeak}
            onToggleAutoSpeak={toggleAutoSpeak}
          />
        </div>

        {/* ── Emergency bar — always visible at bottom ── */}
        <EmergencyBar phrases={emergencyPhrases} />

        {/* ── Top panel ── */}
        <TopPanel
          open={menuOpen}
          user={user}
          onClose={closeMenu}
          onSignOut={onSignOut}
          profile={profile}
          onProfileChange={handleProfileChange}
          store={store}
          // Emergency has no tab of its own, so it would otherwise be the one
          // set of phrases that could not be exported on its own.
          categories={backupCategories}
          categoryById={categoryById}
          onRestore={handleRestore}
        />

        <DwellCursor />

        <div className="toast-region" role="status" aria-live="polite">
          {toast && <div className="toast">{toast}</div>}
        </div>

        {filling && (
          <SlotPicker
            phrase={filling}
            onComplete={t => {
              setFilling(null)
              deliverPhrase(t)
            }}
            onCancel={() => setFilling(null)}
          />
        )}

        {editingCategory !== null && (
          <CategoryModal
            name={editingCategory.name}
            phraseCount={editingCategory.name ? (phraseCountByCategory.get(editingCategory.name) ?? 0) : 0}
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
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
     </RestingContext.Provider>
    </EditCtx.Provider>
  )
}
