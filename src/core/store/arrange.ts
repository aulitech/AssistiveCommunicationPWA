// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { type PhraseStore } from './phrase-store'

// ── Arranging things ─────────────────────────────────────────────────────────
// Pure operations over the phrase store (`phrase-store.ts`): what a category is called, and what
// order the tabs and the emergency bar come in.

/**
 * A phrase's wording, as the board compares two of them: trimmed, folded to
 * lower case, spaces collapsed. **Library holds each wording once**, so this
 * is the whole of what "already on the board" means — a category refers to a
 * phrase rather than holding a copy of it.
 */
export const wordingKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** Phrases the user wrote carry this prefix, which is how a delete tells them apart. */
export const newPhraseId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Call the category `from` by the name `to`. Renaming onto an existing name
 * merges the two, which is the only sane reading of giving two categories the
 * same name: the moved one's phrases go behind those already there, each once.
 */
export function renameCategory(store: PhraseStore, from: string, to: string): Partial<PhraseStore> {
  const members = { ...store.members }
  const moving = members[from] ?? []
  delete members[from]
  const existing = members[to] ?? []
  members[to] = [...existing, ...moving.filter(id => !existing.includes(id))]
  return {
    members,
    // A renamed category keeps the place its old name held; a merge collapses
    // onto the earlier of the two positions.
    categoryOrder: [...new Set(store.categoryOrder.map(c => (c === from ? to : c)))],
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
