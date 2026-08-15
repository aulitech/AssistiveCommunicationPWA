// Narrowing the grid to what is being typed.
//
// Pure, and out here rather than in the screen, so the ranking can be reasoned
// about — and tested — without rendering two thousand cells.

import { type Phrase } from './phrases'
import { stripMarkdown } from './markdown'

/**
 * The phrases to show: the chosen category, narrowed by the word being typed.
 *
 * Ranked rather than filtered, so a near miss still surfaces — a whole-phrase
 * prefix first, then a prefix of any word in it, then the word's letters used as
 * initials ("cyp" finding "can you please").
 *
 * Matched against the words rather than the markup, so `**Help** me` is found by
 * typing "help" — nobody types the asterisks they can see are not there, and the
 * whole-phrase prefix would otherwise never match a phrase that opens with one.
 */
export function search(phrases: Phrase[], category: string, word: string): Phrase[] {
  const pool = category === 'all' ? phrases : phrases.filter(p => p.category === category)
  const q = word.toLowerCase()
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
    .map(p => ({ p, s: score(stripMarkdown(p.text)) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.p)
}
