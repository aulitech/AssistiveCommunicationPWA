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

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { buildPhrases, type Phrase, type AliasStore } from '../core/phrases'
import { stripMarkdown } from '../core/markdown'
import { buildPhrase, categoryIndex, emergencyPhrasesOf, shownCategory } from '../core/board'
import { audioKey, warmAudio } from '../voice/audio-cache'
import { remoteVoiceId } from '../voice/elevenlabs'
import { useSettings } from '../ui/settings'
import {
  loadPhraseStore,
  loadAliases,
  moveInOrder,
  orderCategories,
  renameCategory,
  saveAliases,
  savePhraseStore,
  setVoiceOverride,
  voiceOverrideFor,
  newPhraseId,
  phraseKey,
  wordingKey,
  type PhraseStore,
  type StoredPhrase,
} from '../core/store'

/**
 * Everything a delete takes, so it can be put back.
 *
 * **Deleting was the one change the app offered no way back from**, and the bin
 * sits a dwell's breadth from Save. Only these four things go: the phrase's own
 * entry (or, for one Peri ships, it is hidden), and its places on the emergency
 * bar and in its category's arrangement. Its wording, voice and any category it
 * was moved to stay in the store, which is what lets this be so small.
 */
export interface Removed {
  id: string
  /** A phrase somebody wrote: its entry, and where it was among the others. Null for one Peri ships. */
  custom: { entry: StoredPhrase; at: number } | null
  /** Where it was on the emergency bar's arrangement, or -1. */
  emergencyAt: number
  /** Where it was in its category's hand arrangement, if it had one. */
  arranged: { category: string; at: number } | null
}

/** Every category's arrangement with one phrase taken out, dropping any left empty. */
function withoutPhrase(order: Record<string, string[]>, id: string): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [category, ids] of Object.entries(order)) {
    const kept = ids.filter(i => i !== id)
    if (kept.length > 0) next[category] = kept
  }
  return next
}

export function useBoard() {
  // A phrase's voice is kept per language, so the board has to know which one
  // is being spoken to answer at all. Read here rather than passed in: every
  // caller of `voiceFor` would otherwise have to carry the language to a
  // question that is not about the caller.
  const { settings } = useSettings()
  const language = settings.language
  const [store, setStore] = useState<PhraseStore>(loadPhraseStore)
  const [aliases, setAliases] = useState<AliasStore>(loadAliases)

  const updateStore = useCallback((patch: Partial<PhraseStore>) => {
    setStore(s => {
      const next = { ...s, ...patch }
      savePhraseStore(next)
      return next
    })
  }, [])

  // Re-parsing the whole table is the one piece of work here somebody can watch
  // happen — a couple of thousand phrases, whose slot options are resolved at
  // parse time. Through a transition, so the waiting indicator is painted first
  // and the board catches up behind it rather than the screen simply stopping.
  const [rebuilding, startRebuild] = useTransition()

  const changeAliases = useCallback((next: AliasStore) => {
    saveAliases(next)
    startRebuild(() => setAliases(next))
  }, [])

  // Slot options are resolved at parse time, so the table is rebuilt when the
  // user's own lists change — a few milliseconds, and only on an alias edit.
  const tablePhrases = useMemo(() => buildPhrases(aliases), [aliases])

  // Where each phrase shows — see `shownCategory` in `core/board.ts`.
  const shownIn = useCallback((id: string, source: string) => shownCategory(store, id, source), [store])

  const mainPhrases = useMemo(() => {
    const base = tablePhrases
      .filter(p => !store.hidden.includes(p.id))
      .map(p =>
        store.overrides[p.id]
          ? buildPhrase(p.id, store.overrides[p.id], shownIn(p.id, p.category))
          : { ...p, category: shownIn(p.id, p.category) },
      )
    const custom = store.custom
      .filter(c => c.category !== 'Emergency' && !store.hidden.includes(c.id))
      .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, shownIn(c.id, c.category)))
    return [...base, ...custom]
  }, [store, tablePhrases, shownIn])

  const emergencyPhrases = useMemo(() => emergencyPhrasesOf(store), [store])

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

  // The category every phrase belongs to — see `categoryIndex` in `core/board.ts`.
  const categoryById = useMemo(() => categoryIndex(tablePhrases, store), [tablePhrases, store])

  /**
   * The voice a phrase is said in when it has one of its own **for the language
   * the board is speaking**. Nothing where it has one for some other language:
   * an English voice reading a Spanish phrase is worse than the board's own.
   */
  const voiceFor = useCallback(
    (id: string) => voiceOverrideFor(store.voiceOverrides, id, language),
    [store.voiceOverrides, language],
  )

  // Audio for those phrases is pulled back out of storage and into memory, so
  // that after a reload they can still be said in their own voice with no wait —
  // which is the whole of what lets the emergency bar use one. Assigning a voice
  // fetches it; this is what survives closing the tab.
  //
  // Already-loaded clips are skipped, so re-running on an unrelated edit costs
  // nothing.
  useEffect(() => {
    // Only the voices for the language being spoken. Warming every language's
    // would fetch a board's worth of audio nobody is about to hear, and the
    // clips are paid for.
    const assigned = Object.entries(store.voiceOverrides).flatMap(([id, byLanguage]) => {
      const voiceURI = byLanguage[language]
      return voiceURI ? [[id, voiceURI] as const] : []
    })
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
  }, [store.voiceOverrides, mainPhrases, emergencyPhrases, language])

  /**
   * What is already on the board, by category and wording — the check behind
   * refusing a duplicate.
   *
   * **Within a category only.** The table lists "Good morning" under
   * Interpersonal, Texting and Time of Day, and that is the point: somebody
   * looking for it looks in whichever of the three they think in. What is
   * useless is the same words twice in the same place.
   *
   * Keyed on the source, folded to lower case with its spaces collapsed, so
   * "Thank  you" and "thank you" are the one phrase. The separator is the one
   * character neither a category nor a phrase can hold, written as an escape —
   * a literal NUL makes this file binary to grep.
   */
  const phraseKeys = useMemo(() => {
    const keys = new Map<string, string>()
    for (const p of [...mainPhrases, ...emergencyPhrases]) keys.set(phraseKey(p.source, p.category), p.id)
    return keys
  }, [mainPhrases, emergencyPhrases])

  /**
   * The id of the phrase this wording would duplicate, if there is one.
   * `exceptId` is the phrase being edited, which does not duplicate itself.
   */
  const duplicateOf = useCallback(
    (text: string, category: string, exceptId?: string) => {
      const found = phraseKeys.get(phraseKey(text, category))
      return found && found !== exceptId ? found : undefined
    },
    [phraseKeys],
  )

  /**
   * The phrase on the board saying this, if one does — what the message box is
   * asked about on the way into edit mode.
   *
   * `prefer` is the tab in front of them, and it decides between copies: the
   * same wording is filed under several categories on purpose, and the one
   * already on screen is the one they are looking at. Otherwise the first in
   * board order.
   *
   * **The grid only**, not the emergency bar: what this answers is where to
   * take somebody, and the bar is on screen under every tab already.
   */
  const phraseSaying = useCallback(
    (text: string, prefer?: string) => {
      const key = wordingKey(text)
      const saying = mainPhrases.filter(p => wordingKey(p.source) === key)
      return saying.find(p => p.category === prefer) ?? saying[0]
    },
    [mainPhrases],
  )

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

  /**
   * Give a phrase a voice **for the language the board is speaking**, or take
   * that language's away. The other languages' are left alone, which is the
   * whole point: choosing a Spanish voice must not throw away the English one.
   */
  /**
   * Give a phrase a voice **for the language the board is speaking**, or take
   * that language's away. The arithmetic is `setVoiceOverride`, in core, so the
   * rule it exists for — every other language's voice is kept — can be tested
   * without driving the app through two language changes to watch one object.
   */
  const setVoice = useCallback(
    (id: string, voiceURI: string | undefined) => {
      updateStore({ voiceOverrides: setVoiceOverride(store.voiceOverrides, id, language, voiceURI) })
    },
    [store.voiceOverrides, updateStore, language],
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
  /**
   * Takes a phrase off the board, and hands back everything that took — see
   * `Removed` — so an undo can put it back exactly where it was.
   */
  const removePhrase = useCallback(
    (id: string): Removed => {
      const customAt = store.custom.findIndex(p => p.id === id)
      const arranged = Object.entries(store.phraseOrder).find(([, ids]) => ids.includes(id))
      updateStore({
        ...(id.startsWith('custom-')
          ? { custom: store.custom.filter(p => p.id !== id) }
          : { hidden: [...store.hidden, id] }),
        // Harmless to leave — an id naming nothing is skipped when the bar is
        // arranged — but a store that only ever accumulates is one nobody can
        // read later. A non-emergency id was never in here anyway.
        emergencyOrder: store.emergencyOrder.filter(i => i !== id),
        // The same tidying for the grid's arrangements. Only one category can
        // hold it, but which one is not worth working out to save a pass over
        // a handful of short lists — and a category whose arrangement empties
        // out loses the key rather than keeping an empty one.
        phraseOrder: withoutPhrase(store.phraseOrder, id),
      })
      return {
        id,
        custom: id.startsWith('custom-') && customAt >= 0 ? { entry: store.custom[customAt], at: customAt } : null,
        emergencyAt: store.emergencyOrder.indexOf(id),
        arranged: arranged ? { category: arranged[0], at: arranged[1].indexOf(id) } : null,
      }
    },
    [store, updateStore],
  )

  /**
   * Puts back what `removePhrase` took, **where it was**: among the phrases
   * somebody wrote, on the emergency bar, and in its category's arrangement.
   * Its wording, its voice and any category it was moved to were never taken —
   * a delete leaves those in the store — so this is the whole of the phrase.
   */
  const restorePhrase = useCallback(
    (r: Removed) => {
      const at = (list: string[], index: number) =>
        index < 0 || list.includes(r.id) ? list : [...list.slice(0, index), r.id, ...list.slice(index)]
      updateStore({
        ...(r.custom
          ? store.custom.some(p => p.id === r.id)
            ? {}
            : {
                custom: [
                  ...store.custom.slice(0, r.custom.at),
                  r.custom.entry,
                  ...store.custom.slice(r.custom.at),
                ],
              }
          : { hidden: store.hidden.filter(i => i !== r.id) }),
        emergencyOrder: at(store.emergencyOrder, r.emergencyAt),
        ...(r.arranged && {
          phraseOrder: {
            ...store.phraseOrder,
            [r.arranged.category]: at(store.phraseOrder[r.arranged.category] ?? [], r.arranged.at),
          },
        }),
      })
    },
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
    (name: string) => {
      const phraseOrder = { ...store.phraseOrder }
      delete phraseOrder[name]
      updateStore({
        categories: store.categories.filter(c => c !== name),
        categoryOrder: store.categoryOrder.filter(c => c !== name),
        phraseOrder,
      })
    },
    [store.categories, store.categoryOrder, store.phraseOrder, updateStore],
  )

  // A drag or a drop writes the whole arrangement, so a move made while A–Z is
  // showing captures the order the user could see at the time — and replaces
  // whatever they had arranged before, which is what building a new one means.
  const reorderCategories = useCallback(
    (from: string, to: string) =>
      updateStore({ categoryOrder: moveInOrder(allCategories, from, to), categorySort: 'custom' }),
    [allCategories, updateStore],
  )

  /**
   * Arrange the phrases inside one category by hand.
   *
   * `shown` is the order the user could see at the time, and the move is applied
   * to that — exactly as a category move is. So arranging while A–Z is showing
   * captures the alphabetical order and makes it theirs, which is the only
   * honest answer: a move applied to a hidden order would land somewhere they
   * could not see. The caller is what switches the grid to Custom order, since
   * an arrangement nobody is looking at is not an arrangement.
   */
  const reorderPhrases = useCallback(
    (category: string, shown: string[], from: string, to: string) =>
      updateStore({ phraseOrder: { ...store.phraseOrder, [category]: moveInOrder(shown, from, to) } }),
    [store.phraseOrder, updateStore],
  )

  // The whole arrangement again rather than a step of one, so an order built
  // before a phrase was added still names every button on the bar afterwards.
  const reorderEmergency = useCallback(
    (from: string, to: string) =>
      updateStore({
        emergencyOrder: moveInOrder(
          emergencyPhrases.map(p => p.id),
          from,
          to,
        ),
      }),
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
    (nextStore: PhraseStore, nextAliases: AliasStore) => {
      updateStore(nextStore)
      changeAliases(nextAliases)
    },
    [updateStore, changeAliases],
  )

  return {
    store,
    aliases,
    changeAliases,
    /** True while the table is being parsed again after an alias edit. */
    rebuilding,
    mainPhrases,
    emergencyPhrases,
    allCategories,
    categoryById,
    phraseCountByCategory,
    voiceFor,
    duplicateOf,
    phraseSaying,
    setVoice,
    addPhrase,
    editPhrase,
    removePhrase,
    restorePhrase,
    addCategory,
    renameCategoryTo,
    removeCategory,
    reorderCategories,
    reorderPhrases,
    reorderEmergency,
    toggleSort,
    restore,
  }
}
