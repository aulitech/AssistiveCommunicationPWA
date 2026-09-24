// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { type PhraseStore } from './phrase-store'

// ── Arranging things ─────────────────────────────────────────────────────────
// Pure operations over the phrase store (`phrase-store.ts`): what a category is called, and what
// order the tabs and the emergency bar come in.

/** The name a category is shown under, after any rename. */
/**
 * How a phrase is recognised as one already on the board: its wording and its
 * category, folded to lower case with the spaces collapsed. The editor asks it
 * before a phrase is saved, and a spreadsheet import before a row is added, so
 * the two agree about what "already there" means.
 */
/**
 * A phrase's wording, as the board compares two of them: trimmed, folded to
 * lower case, spaces collapsed.
 *
 * Deliberately without the category, which is the other half of `phraseKey` and
 * a different question: **the same wording is filed under three categories on
 * purpose** — "Good morning" is under Interpersonal, Texting and Time of Day,
 * because somebody looks in whichever of the three they think in.
 */
export const wordingKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

export const phraseKey = (text: string, category: string) =>
  `${category.trim().toLowerCase()}\u0000${wordingKey(text)}`

/** Phrases the user wrote carry this prefix, which is how a delete tells them apart. */
export const newPhraseId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function displayCategory(source: string, renames: Record<string, string>): string {
  return renames[source] ?? source
}

/**
 * Rename every source category currently displayed as `from` so it shows as
 * `to`. Renaming onto an existing name merges the two, which is the only sane
 * reading of giving two categories the same name.
 */
export function renameCategory(store: PhraseStore, from: string, to: string): Partial<PhraseStore> {
  const renames = { ...store.categoryRenames }
  for (const [source, shown] of Object.entries(renames)) {
    if (shown === from) renames[source] = to
  }
  // A source that has never been renamed still displays under its own name.
  if (!(from in renames)) renames[from] = to
  // Identity entries carry no information.
  for (const [source, shown] of Object.entries(renames)) {
    if (source === shown) delete renames[source]
  }
  // The arrangement belongs to the category, so it travels with the name. Where
  // the rename collapses two categories together, the moved one's phrases are
  // appended behind those already arranged under the name they are joining —
  // the rule a merge follows everywhere else here.
  const phraseOrder = { ...store.phraseOrder }
  const moving = phraseOrder[from]
  if (moving) {
    delete phraseOrder[from]
    const existing = phraseOrder[to] ?? []
    phraseOrder[to] = [...existing, ...moving.filter(id => !existing.includes(id))]
  }

  return {
    categoryRenames: renames,
    categories: [...new Set(store.categories.map(c => (c === from ? to : c)))],
    // A renamed category keeps the place its old name held; a merge collapses
    // onto the earlier of the two positions.
    categoryOrder: [...new Set(store.categoryOrder.map(c => (c === from ? to : c)))],
    phraseOrder,
  }
}

/**
 * Arrange category names for display. An empty `order` means alphabetical;
 * otherwise the names it lists come first in that order and anything it has
 * never heard of follows, alphabetically.
 */
export function orderCategories(names: string[], order: string[]): string[] {
  if (order.length === 0) return [...names].sort()
  const rank = new Map(order.map((name, i) => [name, i]))
  const ranked = names.filter(n => rank.has(n)).sort((a, b) => rank.get(a)! - rank.get(b)!)
  const rest = names.filter(n => !rank.has(n)).sort()
  return [...ranked, ...rest]
}

/**
 * Arrange phrases by an id list somebody built by hand. Serves the emergency bar
 * and the phrase grid alike — the bar is one category's worth of buttons and a
 * category is one tab's worth of cells, and the arithmetic never cared which.
 *
 * An empty `order` leaves them exactly as they come, **as the very same array**:
 * the board's own order is not an arrangement, and the grid starts its render
 * window again whenever the list it is given changes identity.
 *
 * Ids the order has never heard of keep their place at the end, so a phrase
 * added later lands after the ones already arranged rather than somewhere in the
 * middle of them, and an id naming a deleted phrase is skipped rather than
 * leaving a hole.
 */
export function orderByIds<T extends { id: string }>(phrases: T[], order: string[]): T[] {
  if (order.length === 0) return phrases
  const rank = new Map(order.map((id, i) => [id, i]))
  const ranked = phrases.filter(p => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const rest = phrases.filter(p => !rank.has(p.id))
  return [...ranked, ...rest]
}

/**
 * The full order after moving `from` to where `to` sits. Landing after the
 * target when moving rightwards and before it when moving leftwards is what
 * puts the thing being moved where the pointer actually is, either way.
 *
 * Serves the category tabs and the emergency bar alike: the first arranges
 * names, the second ids, and the arithmetic never cared which.
 */
export function moveInOrder(shown: string[], from: string, to: string): string[] {
  const fromIndex = shown.indexOf(from)
  const toIndex = shown.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || from === to) return shown
  const rest = shown.filter(c => c !== from)
  rest.splice(rest.indexOf(to) + (fromIndex < toIndex ? 1 : 0), 0, from)
  return rest
}
