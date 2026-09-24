// What a phrase store says the board is — the parts of it that have to come out
// the same however they are asked for.
//
// Out of `talk/use-board.ts`, which asks them of the store in memory, because
// one other place has to ask them of the store on disk: the screen shown when
// the app itself has failed (`talk/error-boundary.tsx`), which cannot lean on a
// hook that may be the thing that failed. Two copies of how a board is read are
// two chances for the emergency bar to come out differently on the one screen
// where it has to be right.

import { EMERGENCY_PHRASES, compose, parseSegments, type Phrase } from './phrases'
import { displayCategory, orderByIds, type PhraseStore } from './store'

/**
 * A phrase from what it was written as. Overrides and phrases the user wrote
 * are re-parsed, so they behave like any other — and keep the id they were
 * stored under, which is what a delete matches on.
 */
export function buildPhrase(id: string, raw: string, category: string): Phrase {
  const segments = parseSegments(raw)
  return { id, text: compose(segments), source: raw, segments, category }
}

/**
 * Where a phrase shows. One moved on its own keeps that category; otherwise it
 * follows any rename applied to the one it came in.
 */
export const shownCategory = (store: PhraseStore, id: string, source: string): string =>
  store.categoryOverrides[id] ?? displayCategory(source, store.categoryRenames)

/**
 * The emergency bar, as the person using it arranged it.
 *
 * Which button is where matters more here than anywhere else in the app — this
 * is the bar somebody reaches for without reading it — so their own arrangement
 * wins over the one Peri ships.
 */
export function emergencyPhrasesOf(store: PhraseStore): Phrase[] {
  const base = EMERGENCY_PHRASES.filter(p => !store.hidden.includes(p.id)).map(p =>
    store.overrides[p.id] ? buildPhrase(p.id, store.overrides[p.id], p.category) : p,
  )
  const custom = store.custom
    .filter(c => c.category === 'Emergency' && !store.hidden.includes(c.id))
    .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, 'Emergency'))
  return orderByIds([...base, ...custom], store.emergencyOrder)
}

/**
 * The category every phrase belongs to, hidden ones included.
 *
 * Exporting a few categories needs a category for phrases that are not on
 * screen: one the user removed still belongs to the category it came from, and
 * that is the only way to tell whether their removal is part of what they asked
 * to export. A whole backup needs it too, to file a phrase somebody moved under
 * the category they moved it to.
 */
export function categoryIndex(table: Phrase[], store: PhraseStore): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of table) map.set(p.id, shownCategory(store, p.id, p.category))
  for (const p of EMERGENCY_PHRASES) map.set(p.id, 'Emergency')
  for (const c of store.custom) map.set(c.id, shownCategory(store, c.id, c.category))
  return map
}

/**
 * The categories that have a phrase in them — the ones a tab has something to
 * show under. The emergency bar is not one.
 */
export function categoriesInUse(table: Phrase[], store: PhraseStore): Set<string> {
  const hidden = new Set(store.hidden)
  const used = new Set<string>()
  for (const p of table) if (!hidden.has(p.id)) used.add(shownCategory(store, p.id, p.category))
  for (const c of store.custom) {
    if (c.category !== 'Emergency' && !hidden.has(c.id)) used.add(shownCategory(store, c.id, c.category))
  }
  return used
}

/**
 * The store with a category taken away **where nothing is left in it** —
 * `names`, or every one when none are named.
 *
 * A category somebody made is kept while it is empty, so one can be made first
 * and filled afterwards. But once the last phrase has gone from it, or an
 * import has left it holding nothing, it is a tab that opens onto a blank grid:
 * one more thing to read past on the way to something that says anything. So
 * a delete or a move drops the one category it emptied — and only that one, so
 * a category made a moment ago and not yet filled is not taken with it — and
 * an import drops every one.
 *
 * Its place in the hand-made order and its arrangement go with it; a phrase
 * put back into it later brings the tab back at the end.
 */
export function withoutEmptyCategories(table: Phrase[], store: PhraseStore, names?: string[]): PhraseStore {
  const used = categoriesInUse(table, store)
  const empty = new Set(
    (names ?? [...store.categories, ...store.categoryOrder, ...Object.keys(store.phraseOrder)]).filter(
      name => !used.has(name),
    ),
  )
  if (empty.size === 0) return store
  const phraseOrder = { ...store.phraseOrder }
  for (const name of empty) delete phraseOrder[name]
  return {
    ...store,
    categories: store.categories.filter(c => !empty.has(c)),
    categoryOrder: store.categoryOrder.filter(c => !empty.has(c)),
    phraseOrder,
  }
}
