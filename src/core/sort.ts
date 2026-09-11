// What order the grid is in.
//
// Four arrangements, offered under every category tab: the board's own order,
// A–Z, what was used most recently, and what is used most often. Pure, and out
// here rather than in the screen, so the arithmetic can be reasoned about — and
// tested — without rendering two thousand cells.
//
// **Sorting happens before the search ranks anything.** `search` filters to a
// category and then ranks by how well each phrase matches the word being typed,
// and both of those keep the order they were given — `Array.prototype.sort` is
// stable and `filter` cannot reorder. So arranging the board first means the
// chosen order decides ties *within* a rank band, while a typed word still puts
// the best match first. The other way round, "ttyl" would find "Talk to you
// later" and then bury it under everything else that happened to match.

import { stripMarkdown } from './markdown'
import { type Phrase } from './phrases'
import { type PhraseSort, type PhraseUsage, type PhraseUse } from './store'

/** The four, in the order they are offered. Named for what they do, not for how. */
export const PHRASE_SORTS: { id: PhraseSort; name: string; detail: string }[] = [
  { id: 'custom', name: 'Custom order', detail: 'The order the board is in' },
  { id: 'alpha', name: 'A to Z', detail: 'By what each phrase says' },
  { id: 'recent', name: 'Recently used', detail: 'What you used last, first' },
  { id: 'frequent', name: 'Most used', detail: 'What you use most, first' },
]

/** What a sort is called, for a control that has to say which one is on. */
export const sortName = (sort: PhraseSort) => PHRASE_SORTS.find(s => s.id === sort)?.name ?? 'Custom order'

/**
 * The phrases in the chosen order.
 *
 * Three things hold this together:
 *
 * - **The board's own order is the same array, not a copy of it.** The grid
 *   starts its window again whenever the list it was given changes identity, so
 *   a sort that rebuilt the array every render would collapse the window — and
 *   the view with it — every time anything else on the screen moved.
 * - **A phrase nobody has used goes after every phrase somebody has**, in the
 *   order the board already had it. Ranking the unused among themselves would
 *   mean a board that has barely been used comes out shuffled, which is the
 *   opposite of what asking for "recently used" means.
 * - **Ties keep the board's order**, because the sort is stable and the ranked
 *   list is built by walking the board once.
 */
export function sortPhrases(phrases: Phrase[], sort: PhraseSort, usage: PhraseUsage): Phrase[] {
  if (sort === 'custom') return phrases

  // Compared on the words rather than the markup, for the reason search matches
  // on them: `**Help** me` files under H, where somebody reading the board sees
  // it, rather than under the asterisks nobody can see.
  if (sort === 'alpha') {
    return [...phrases].sort((a, b) => stripMarkdown(a.text).localeCompare(stripMarkdown(b.text)))
  }

  const by =
    sort === 'recent'
      ? (a: PhraseUse, b: PhraseUse) => b.at - a.at || b.count - a.count
      : (a: PhraseUse, b: PhraseUse) => b.count - a.count || b.at - a.at

  const used: Phrase[] = []
  const unused: Phrase[] = []
  for (const phrase of phrases) (usage[phrase.id] ? used : unused).push(phrase)
  used.sort((a, b) => by(usage[a.id], usage[b.id]))
  return [...used, ...unused]
}
