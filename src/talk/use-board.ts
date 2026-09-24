// What is on the board, and every way of changing it.
//
// **Every phrase lives in Library, and a category is a list of references to
// Library phrases**, in an order of its own — see
// docs/decisions/categories-as-references.md. The stored form is a diff —
// overrides, hidden ids, the references — and the app needs whole phrases, so
// almost everything here is the same derivation seen from a different angle.
// Each one is memoised because the grid renders every phrase in the table and a
// stray recomputation is felt.
//
// Announcements are not this hook's job. Operations report what they did and the
// screen decides what to say, so the same operation can be silent when the
// screen already shows the result.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { LIBRARY, buildPhrases, type Phrase, type AliasStore } from '../core/phrases'
import { stripMarkdown } from '../core/markdown'
import { emergencyPhrasesOf, libraryOf, phrasesIn, withoutEmptyCategories } from '../core/board'
import { audioKey, warmAudio } from '../voice/audio-cache'
import { remoteVoiceId } from '../voice/elevenlabs'
import { useSettings } from '../ui/settings'
import {
  foldFormerCopies,
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
  wordingKey,
  type PhraseStore,
  type StoredPhrase,
} from '../core/store'

const EMERGENCY = 'Emergency'

/**
 * Everything a delete or a removal takes, so it can be put back.
 *
 * **Deleting was the one change the app offered no way back from**, and the bin
 * sits a dwell's breadth from Save. On Library the bin deletes the phrase: its
 * own entry goes (or, for one Peri ships, it is hidden), and with it its places
 * on the emergency bar, in Library's arrangement and in every category that
 * referred to it. On a category it only takes the phrase out of that category.
 * Its wording and voice stay in the store either way, which is what lets this
 * be so small.
 */
export interface Removed {
  id: string
  /** Only taken out of this category — the phrase itself is still in Library. */
  from: string | null
  /** A phrase somebody wrote: its entry, and where it was among the others. Null for one Peri ships. */
  custom: { entry: StoredPhrase; at: number } | null
  /** Where it was on the emergency bar's arrangement, or -1. */
  emergencyAt: number
  /** Where it was in Library's arrangement, or -1. */
  libraryAt: number
  /** Every category that referred to it, and where in each. */
  referredBy: { category: string; at: number }[]
  /**
   * The categories it emptied, and where each stood in the tabs' order — a
   * category goes with its last phrase, and an undo brings it back to the place
   * it had rather than the end of the bar.
   */
  emptied: { category: string; orderAt: number }[]
}

/** A list with this item put back at this place, if it is not there already. */
const putBack = (list: string[], item: string, at: number) =>
  at < 0 || list.includes(item) ? list : [...list.slice(0, at), item, ...list.slice(at)]

/** The references with one phrase in these categories set to exactly these. */
function withMemberships(
  members: Record<string, string[]>,
  id: string,
  categories: string[],
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [category, ids] of Object.entries(members)) {
    const wanted = categories.includes(category)
    // Where it is already referred to it keeps its place; new, it goes last.
    next[category] = wanted ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter(i => i !== id)
  }
  for (const category of categories) if (!(category in next) && category !== LIBRARY) next[category] = [id]
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

  /** Library: every phrase on the board — see `libraryOf` in `core/board.ts`. */
  const mainPhrases = useMemo(() => libraryOf(tablePhrases, store), [tablePhrases, store])

  const emergencyPhrases = useMemo(() => emergencyPhrasesOf(store), [store])

  const allCategories = useMemo(
    // Every category somebody made — listed even while empty, so one can be
    // made first and filled afterwards, until its last phrase goes or an import
    // lands: see `withoutEmptyCategories`. **Library is not among them**: it is
    // where every phrase lives, and has a tab of its own pinned in front.
    () =>
      orderCategories(
        Object.keys(store.members),
        // The custom arrangement is kept while A–Z is showing; it just is not
        // the one being applied.
        store.categorySort === 'custom' ? store.categoryOrder : [],
      ),
    [store.members, store.categoryOrder, store.categorySort],
  )

  /** A category's phrases, in its own order. */
  const phrasesOf = useCallback(
    (category: string) => phrasesIn(category, mainPhrases, store),
    [mainPhrases, store],
  )

  /** The categories that refer to a phrase — never Library, which holds them all. */
  const categoriesOf = useCallback(
    (id: string) => Object.keys(store.members).filter(category => store.members[category].includes(id)),
    [store.members],
  )

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
   * What is already on the board, by wording — the check behind refusing a
   * duplicate. **Library holds each wording once**; the emergency bar is its
   * own place and is checked on its own.
   *
   * Keyed on the source, folded to lower case with its spaces collapsed, so
   * "Thank  you" and "thank you" are the one phrase.
   */
  const libraryKeys = useMemo(() => new Map(mainPhrases.map(p => [wordingKey(p.source), p.id])), [mainPhrases])
  const emergencyKeys = useMemo(
    () => new Map(emergencyPhrases.map(p => [wordingKey(p.source), p.id])),
    [emergencyPhrases],
  )

  /**
   * The id of the phrase this wording would duplicate, if there is one — in
   * Library, or on the emergency bar where that is where it is going.
   * `exceptId` is the phrase being edited, which does not duplicate itself.
   */
  const duplicateOf = useCallback(
    (text: string, onBar: boolean, exceptId?: string) => {
      const found = (onBar ? emergencyKeys : libraryKeys).get(wordingKey(text))
      return found && found !== exceptId ? found : undefined
    },
    [libraryKeys, emergencyKeys],
  )

  /**
   * The phrase on the board saying this, if one does — what the message box is
   * asked about on the way into edit mode. **The grid only**, not the emergency
   * bar: what this answers is where to take somebody, and the bar is on screen
   * under every tab already.
   */
  const phraseSaying = useCallback(
    (text: string) => {
      const id = libraryKeys.get(wordingKey(text))
      return id ? mainPhrases.find(p => p.id === id) : undefined
    },
    [libraryKeys, mainPhrases],
  )

  const phraseCountByCategory = useMemo(() => {
    const live = new Set(mainPhrases.map(p => p.id))
    const counts = new Map<string, number>([[LIBRARY, mainPhrases.length]])
    for (const [category, ids] of Object.entries(store.members)) {
      counts.set(category, ids.filter(id => live.has(id)).length)
    }
    return counts
  }, [mainPhrases, store.members])

  // ── Changing what is on it ─────────────────────────────────────────────────

  /**
   * Adds a phrase to Library — or to the emergency bar — and to each category
   * named, at its end. Hands back its id, which is the only way the caller can
   * give a brand-new phrase a voice of its own: the id is made here, and until
   * the phrase exists there is nothing to hang one on.
   */
  const addPhrase = useCallback(
    (text: string, categories: string[], isEmergency: boolean) => {
      const id = newPhraseId()
      updateStore({
        custom: [...store.custom, { id, text, category: isEmergency ? EMERGENCY : LIBRARY }],
        ...(!isEmergency && { members: withMemberships(store.members, id, categories) }),
      })
      return id
    },
    [store, updateStore],
  )

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

  /**
   * Rewords a phrase and sets which categories refer to it. One it stays in
   * keeps its place there; one it joins has it at the end; one it leaves goes
   * if that was the last thing in it.
   */
  const editPhrase = useCallback(
    (phrase: Phrase, text: string, categories: string[], isEmergency: boolean) => {
      const patch: Partial<PhraseStore> = { overrides: { ...store.overrides, [phrase.id]: text } }
      if (!isEmergency) {
        const left = Object.keys(store.members).filter(
          c => store.members[c].includes(phrase.id) && !categories.includes(c),
        )
        const next = withoutEmptyCategories(
          tablePhrases,
          { ...store, ...patch, members: withMemberships(store.members, phrase.id, categories) },
          left,
        )
        patch.members = next.members
        patch.categoryOrder = next.categoryOrder
      }
      updateStore(patch)
    },
    [store, updateStore, tablePhrases],
  )

  /**
   * Takes a phrase off the board, or — `from` a category — out of that category
   * alone, and hands back everything that took (see `Removed`) so an undo can
   * put it back exactly where it was.
   */
  const removePhrase = useCallback(
    (id: string, from: string | null = null): Removed => {
      const referredBy = Object.entries(store.members)
        .filter(([category, ids]) => ids.includes(id) && (from === null || category === from))
        .map(([category, ids]) => ({ category, at: ids.indexOf(id) }))
      const customAt = store.custom.findIndex(p => p.id === id)
      const members = { ...store.members }
      for (const { category } of referredBy) members[category] = members[category].filter(i => i !== id)
      const patch: Partial<PhraseStore> = { members }
      if (from === null) {
        Object.assign(patch, {
          ...(id.startsWith('custom-')
            ? { custom: store.custom.filter(p => p.id !== id) }
            : { hidden: [...store.hidden, id] }),
          // Harmless to leave — an id naming nothing is skipped when either is
          // arranged — but a store that only ever accumulates is one nobody can
          // read later.
          emergencyOrder: store.emergencyOrder.filter(i => i !== id),
          libraryOrder: store.libraryOrder.filter(i => i !== id),
        })
      }
      // The last phrase in a category takes the category with it.
      const next = withoutEmptyCategories(
        tablePhrases,
        { ...store, ...patch },
        referredBy.map(r => r.category),
      )
      updateStore({ ...patch, members: next.members, categoryOrder: next.categoryOrder })
      return {
        id,
        from,
        custom:
          from === null && id.startsWith('custom-') && customAt >= 0
            ? { entry: store.custom[customAt], at: customAt }
            : null,
        emergencyAt: from === null ? store.emergencyOrder.indexOf(id) : -1,
        libraryAt: from === null ? store.libraryOrder.indexOf(id) : -1,
        referredBy,
        emptied: referredBy
          .filter(r => !(r.category in next.members))
          .map(r => ({ category: r.category, orderAt: store.categoryOrder.indexOf(r.category) })),
      }
    },
    [store, updateStore, tablePhrases],
  )

  /**
   * Puts back what `removePhrase` took, **where it was**: among the phrases
   * somebody wrote, on the emergency bar, in Library's arrangement, in every
   * category that referred to it, and each category it emptied back in its
   * place among the tabs.
   */
  const restorePhrase = useCallback(
    (r: Removed) => {
      const members = { ...store.members }
      for (const { category, at } of r.referredBy) members[category] = putBack(members[category] ?? [], r.id, at)
      let categoryOrder = store.categoryOrder
      for (const { category, orderAt } of r.emptied) categoryOrder = putBack(categoryOrder, category, orderAt)
      updateStore({
        members,
        categoryOrder,
        ...(r.from === null && {
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
          emergencyOrder: putBack(store.emergencyOrder, r.id, r.emergencyAt),
          libraryOrder: putBack(store.libraryOrder, r.id, r.libraryAt),
        }),
      })
    },
    [store, updateStore],
  )

  const addCategory = useCallback(
    (name: string) => {
      if (name === LIBRARY || name in store.members) return
      updateStore({ members: { ...store.members, [name]: [] } })
    },
    [store.members, updateStore],
  )

  const renameCategoryTo = useCallback(
    (from: string, to: string) => updateStore(renameCategory(store, from, to)),
    [store, updateStore],
  )

  /**
   * Takes a category off the board. **Its phrases stay in Library** — a
   * category only ever referred to them — so this deletes nothing anybody said.
   */
  const removeCategory = useCallback(
    (name: string) => {
      const members = { ...store.members }
      delete members[name]
      updateStore({ members, categoryOrder: store.categoryOrder.filter(c => c !== name) })
    },
    [store.members, store.categoryOrder, updateStore],
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
   * Arrange the phrases inside one category by hand — Library's arrangement, or
   * a category's own order of references.
   *
   * `shown` is the order the user could see at the time, and the move is applied
   * to that — exactly as a category move is. So arranging while A–Z is showing
   * captures the alphabetical order and makes it theirs, which is the only
   * honest answer: a move applied to a hidden order would land somewhere they
   * could not see. The caller is what switches the grid to Custom order, since
   * an arrangement nobody is looking at is not an arrangement.
   */
  const reorderPhrases = useCallback(
    (category: string, shown: string[], from: string, to: string) => {
      const order = moveInOrder(shown, from, to)
      if (category === LIBRARY) updateStore({ libraryOrder: order })
      else if (category in store.members) {
        // What is shown is every reference, in edit mode where arranging is;
        // any it did not show keep their place behind.
        const rest = store.members[category].filter(id => !order.includes(id))
        updateStore({ members: { ...store.members, [category]: [...order, ...rest] } })
      }
    },
    [store.members, updateStore],
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
    (nextStore: PhraseStore, nextAliases: AliasStore, imported = false) => {
      // From a backup or another device, either of which may be from before
      // the table was collapsed — so the ids are moved on, but nothing hidden
      // is brought back: that is for this board's own first look.
      const folded = foldFormerCopies(nextStore)
      // **An import leaves no empty category behind** — a file or a sheet
      // somebody else made can name categories this board has nothing in, and
      // replacing can empty the ones it had. Not what another device sends: a
      // category made there a moment ago and not yet filled is theirs to fill.
      updateStore(imported ? withoutEmptyCategories(tablePhrases, folded) : folded)
      changeAliases(nextAliases)
    },
    [updateStore, changeAliases, tablePhrases],
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
    phrasesOf,
    categoriesOf,
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

export type Board = ReturnType<typeof useBoard>
