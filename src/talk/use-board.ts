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

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EMERGENCY_PHRASES,
  buildPhrases,
  compose,
  parseSegments,
  type Phrase,
  type Aliases,
} from '../core/phrases'
import { stripMarkdown } from '../core/markdown'
import { audioKey, warmAudio } from '../voice/audio-cache'
import { remoteVoiceId } from '../voice/elevenlabs'
import {
  displayCategory,
  loadPhraseStore,
  loadAliases,
  moveInOrder,
  orderCategories,
  orderEmergency,
  renameCategory,
  saveAliases,
  savePhraseStore,
  type PhraseStore,
} from '../core/store'

/** Phrases the user wrote carry this prefix, which is how a delete tells them apart. */
const newPhraseId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function useBoard() {
  const [store, setStore] = useState<PhraseStore>(loadPhraseStore)
  const [aliases, setAliases] = useState<Aliases>(loadAliases)

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => {
      const next = { ...s, ...patch }
      savePhraseStore(next)
      return next
    })
  }, [])

  const changeAliases = useCallback((next: Aliases) => {
    saveAliases(next)
    setAliases(next)
  }, [])

  // Overrides and user-authored phrases are re-parsed, so they behave like any
  // other phrase — and keep their stored id, which is what delete matches on.
  const buildPhrase = useCallback((id: string, raw: string, category: string): Phrase => {
    const segments = parseSegments(raw)
    return { id, text: compose(segments), source: raw, segments, category }
  }, [])

  // Slot options are resolved at parse time, so the table is rebuilt when the
  // user's own lists change — a few milliseconds, and only on an alias edit.
  const tablePhrases = useMemo(() => buildPhrases(aliases), [aliases])

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
    // Which button is where matters more here than anywhere else in the app —
    // this is the bar somebody reaches for without reading it — so the user's
    // own arrangement wins over the one Peri ships.
    return orderEmergency([...base, ...custom], store.emergencyOrder)
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

  /** The voice a phrase is said in, when it has one of its own. */
  const voiceFor = useCallback((id: string) => store.voiceOverrides[id], [store.voiceOverrides])

  // Audio for those phrases is pulled back out of storage and into memory, so
  // that after a reload they can still be said in their own voice with no wait —
  // which is the whole of what lets the emergency bar use one. Assigning a voice
  // fetches it; this is what survives closing the tab.
  //
  // Already-loaded clips are skipped, so re-running on an unrelated edit costs
  // nothing.
  useEffect(() => {
    const assigned = Object.entries(store.voiceOverrides)
    if (assigned.length === 0) return
    const textById = new Map([...mainPhrases, ...emergencyPhrases].map(p => [p.id, p.text]))
    const keys = assigned.flatMap(([id, voiceURI]) => {
      const voiceId = remoteVoiceId(voiceURI)
      const text = textById.get(id)
      // Keyed by the words, exactly as `speak` keys them — a clip stored under
      // the marked-up text is a clip the phrase asking for it never finds.
      return voiceId && text ? [audioKey(voiceId, stripMarkdown(text))] : []
    })
    if (keys.length > 0) void warmAudio(keys)
  }, [store.voiceOverrides, mainPhrases, emergencyPhrases])

  const phraseCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of mainPhrases) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return counts
  }, [mainPhrases])

  // ── Changing what is on it ─────────────────────────────────────────────────

  /**
   * Adds a phrase and hands back its id, which is the only way the caller can
   * give a brand-new phrase a voice of its own: the id is made here, and until
   * the phrase exists there is nothing to hang one on.
   */
  const addPhrase = useCallback(
    (text: string, category: string, isEmergency: boolean) => {
      const id = newPhraseId()
      updateStore({
        custom: [...store.custom, { id, text, category: isEmergency ? 'Emergency' : category }],
        categories: isEmergency ? store.categories : [...new Set([...store.categories, category])],
      })
      return id
    },
    [store, updateStore],
  )

  const setVoice = useCallback(
    (id: string, voiceURI: string | undefined) => {
      const next = { ...store.voiceOverrides }
      if (voiceURI) next[id] = voiceURI
      else delete next[id]
      updateStore({ voiceOverrides: next })
    },
    [store.voiceOverrides, updateStore],
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
      updateStore({
        ...(id.startsWith('custom-')
          ? { custom: store.custom.filter(p => p.id !== id) }
          : { hidden: [...store.hidden, id] }),
        // Harmless to leave — an id naming nothing is skipped when the bar is
        // arranged — but a store that only ever accumulates is one nobody can
        // read later. A non-emergency id was never in here anyway.
        emergencyOrder: store.emergencyOrder.filter(i => i !== id),
      }),
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
      updateStore({ categoryOrder: moveInOrder(allCategories, from, to), categorySort: 'custom' }),
    [allCategories, updateStore],
  )

  // The whole arrangement again rather than a step of one, so an order built
  // before a phrase was added still names every button on the bar afterwards.
  const reorderEmergency = useCallback(
    (from: string, to: string) =>
      updateStore({ emergencyOrder: moveInOrder(emergencyPhrases.map(p => p.id), from, to) }),
    [emergencyPhrases, updateStore],
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
    (nextStore: PhraseStore, nextAliases: Aliases) => {
      updateStore(nextStore)
      changeAliases(nextAliases)
    },
    [updateStore, changeAliases],
  )

  return {
    store,
    aliases,
    changeAliases,
    mainPhrases,
    emergencyPhrases,
    allCategories,
    categoryById,
    phraseCountByCategory,
    voiceFor,
    setVoice,
    addPhrase,
    editPhrase,
    removePhrase,
    addCategory,
    renameCategoryTo,
    removeCategory,
    reorderCategories,
    reorderEmergency,
    toggleSort,
    restore,
  }
}
