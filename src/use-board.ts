// What is on the board, and every way of changing it.
//
// The stored form is a diff — overrides, hidden ids, renames — and the app needs
// whole phrases in whole categories, so almost everything here is the same
// derivation seen from a different angle. Each one is memoised because the grid
// renders every phrase in the table and a stray recomputation is felt.
//
// Announcements are not this hook's job. Operations report what they did and the
// screen decides what to say, so the same operation can be silent when the
// screen already shows the result.

import { useCallback, useMemo, useState } from 'react'
import {
  EMERGENCY_PHRASES,
  buildPhrases,
  compose,
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
} from './store'

/** Phrases the user wrote carry this prefix, which is how a delete tells them apart. */
const newPhraseId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function useBoard() {
  const [store, setStore] = useState<PhraseStore>(loadPhraseStore)
  const [profile, setProfile] = useState<Profile>(loadProfile)

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => {
      const next = { ...s, ...patch }
      savePhraseStore(next)
      return next
    })
  }, [])

  const changeProfile = useCallback((next: Profile) => {
    saveProfile(next)
    setProfile(next)
  }, [])

  // Overrides and user-authored phrases are re-parsed, so they behave like any
  // other phrase — and keep their stored id, which is what delete matches on.
  const buildPhrase = useCallback((id: string, raw: string, category: string): Phrase => {
    const segments = parseSegments(raw)
    return { id, text: compose(segments), segments, category }
  }, [])

  // Slot options are resolved at parse time, so the table is rebuilt when the
  // user's own details change — a few milliseconds, and only on a profile edit.
  const tablePhrases = useMemo(() => buildPhrases(profile), [profile])

  // A phrase moved individually keeps that category; otherwise it follows any
  // rename applied to the category it came in.
  const shownCategory = useCallback(
    (id: string, source: string) =>
      store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames),
    [store.categoryOverrides, store.categoryRenames],
  )

  const mainPhrases = useMemo(() => {
    const base = tablePhrases
      .filter(p => !store.hidden.includes(p.id))
      .map(p =>
        store.overrides[p.id]
          ? buildPhrase(p.id, store.overrides[p.id], shownCategory(p.id, p.category))
          : { ...p, category: shownCategory(p.id, p.category) },
      )
    const custom = store.custom
      .filter(c => c.category !== 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, shownCategory(c.id, c.category)))
    return [...base, ...custom]
  }, [store, buildPhrase, tablePhrases, shownCategory])

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
    for (const p of tablePhrases) map.set(p.id, shownCategory(p.id, p.category))
    for (const p of EMERGENCY_PHRASES) map.set(p.id, 'Emergency')
    for (const c of store.custom) map.set(c.id, shownCategory(c.id, c.category))
    return map
  }, [tablePhrases, store.custom, shownCategory])

  const phraseCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of mainPhrases) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return counts
  }, [mainPhrases])

  // ── Changing what is on it ─────────────────────────────────────────────────

  const addPhrase = useCallback(
    (text: string, category: string, isEmergency: boolean) =>
      updateStore({
        custom: [...store.custom, { id: newPhraseId(), text, category: isEmergency ? 'Emergency' : category }],
        categories: isEmergency ? store.categories : [...new Set([...store.categories, category])],
      }),
    [store, updateStore],
  )

  const editPhrase = useCallback(
    (phrase: Phrase, text: string, category: string, isEmergency: boolean) => {
      const patch: Partial<PhraseStore> = { overrides: { ...store.overrides, [phrase.id]: text } }
      // The editor has always shown a category for existing phrases; until
      // now, changing it was silently discarded.
      if (!isEmergency && category && category !== phrase.category) {
        patch.categoryOverrides = { ...store.categoryOverrides, [phrase.id]: category }
        patch.categories = [...new Set([...store.categories, category])]
      }
      updateStore(patch)
    },
    [store, updateStore],
  )

  /** Deletes one the user wrote; hides one that came with the app. */
  const removePhrase = useCallback(
    (id: string) =>
      updateStore(
        id.startsWith('custom-')
          ? { custom: store.custom.filter(p => p.id !== id) }
          : { hidden: [...store.hidden, id] },
      ),
    [store, updateStore],
  )

  const addCategory = useCallback(
    (name: string) => updateStore({ categories: [...new Set([...store.categories, name])] }),
    [store.categories, updateStore],
  )

  const renameCategoryTo = useCallback(
    (from: string, to: string) => updateStore(renameCategory(store, from, to)),
    [store, updateStore],
  )

  const removeCategory = useCallback(
    (name: string) =>
      updateStore({
        categories: store.categories.filter(c => c !== name),
        categoryOrder: store.categoryOrder.filter(c => c !== name),
      }),
    [store.categories, store.categoryOrder, updateStore],
  )

  // A drag or a drop writes the whole arrangement, so a move made while A–Z is
  // showing captures the order the user could see at the time — and replaces
  // whatever they had arranged before, which is what building a new one means.
  const reorderCategories = useCallback(
    (from: string, to: string) =>
      updateStore({ categoryOrder: moveCategory(allCategories, from, to), categorySort: 'custom' }),
    [allCategories, updateStore],
  )

  /**
   * Swaps the two arrangements and reports which one is now showing. The custom
   * one is left in the store either way, so going to A–Z and back is not a way
   * to lose it.
   */
  const toggleSort = useCallback(() => {
    const next = store.categorySort === 'custom' ? 'alpha' : 'custom'
    updateStore({ categorySort: next })
    return next
  }, [store.categorySort, updateStore])

  /**
   * An import lands in one go rather than a field at a time, so there is no
   * moment where the grid is showing half of somebody's backup.
   */
  const restore = useCallback(
    (nextStore: PhraseStore, nextProfile: Profile) => {
      updateStore(nextStore)
      changeProfile(nextProfile)
    },
    [updateStore, changeProfile],
  )

  return {
    store,
    profile,
    changeProfile,
    mainPhrases,
    emergencyPhrases,
    allCategories,
    categoryById,
    phraseCountByCategory,
    addPhrase,
    editPhrase,
    removePhrase,
    addCategory,
    renameCategoryTo,
    removeCategory,
    reorderCategories,
    toggleSort,
    restore,
  }
}
