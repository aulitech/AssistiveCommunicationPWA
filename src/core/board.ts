// What a phrase store says the board is — the parts of it that have to come out
// the same however they are asked for.
//
// Out of `talk/use-board.ts`, which asks them of the store in memory, because
// one other place has to ask them of the store on disk: the screen shown when
// the app itself has failed (`talk/error-boundary.tsx`), which cannot lean on a
// hook that may be the thing that failed. Two copies of how a board is read are
// two chances for the emergency bar to come out differently on the one screen
// where it has to be right.

import { EMERGENCY_PHRASES, LIBRARY, compose, parseSegments, type Phrase } from './phrases'
import { orderByIds, type PhraseStore } from './store'

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
 * **Library: every phrase on the board**, in the board's order — the table's,
 * then the ones somebody wrote — each as it reads now. The emergency bar is not
 * in it. A category is a list of references into this.
 */
export function libraryOf(table: Phrase[], store: PhraseStore): Phrase[] {
  const hidden = new Set(store.hidden)
  const shipped = table
    .filter(p => !hidden.has(p.id))
    .map(p =>
      store.overrides[p.id] ? buildPhrase(p.id, store.overrides[p.id], LIBRARY) : { ...p, category: LIBRARY },
    )
  const mine = store.custom
    .filter(c => c.category !== 'Emergency' && !hidden.has(c.id))
    .map(c => buildPhrase(c.id, store.overrides[c.id] ?? c.text, LIBRARY))
  return [...shipped, ...mine]
}

/**
 * The Library phrases a category refers to, in its own order — ids naming a
 * phrase that is not on the board skipped rather than leaving a hole.
 */
export function phrasesIn(category: string, library: Phrase[], store: PhraseStore): Phrase[] {
  if (category === LIBRARY) return library
  const byId = new Map(library.map(p => [p.id, p]))
  return (store.members[category] ?? []).flatMap(id => byId.get(id) ?? [])
}

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
 * The categories that refer to a phrase on the board — the ones a tab has
 * something to show under. Library is not asked: it is where every phrase
 * lives, and is never empty in the sense that matters here.
 */
export function categoriesInUse(table: Phrase[], store: PhraseStore): Set<string> {
  const live = new Set(libraryOf(table, store).map(p => p.id))
  return new Set(
    Object.entries(store.members)
      .filter(([, ids]) => ids.some(id => live.has(id)))
      .map(([category]) => category),
  )
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
 * an import drops every one. Its place in the hand-made order goes with it.
 */
export function withoutEmptyCategories(table: Phrase[], store: PhraseStore, names?: string[]): PhraseStore {
  const used = categoriesInUse(table, store)
  const empty = new Set(
    (names ?? Object.keys(store.members)).filter(name => name in store.members && !used.has(name)),
  )
  if (empty.size === 0) return store
  const members = { ...store.members }
  for (const name of empty) delete members[name]
  return { ...store, members, categoryOrder: store.categoryOrder.filter(c => !empty.has(c)) }
}
