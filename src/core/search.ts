// Finding a phrase from what is being typed.
//
// Pure, and out here rather than in the screen, so the ranking can be reasoned
// about — and tested — without rendering two thousand cells.

import { type Phrase } from './phrases'
import { stripMarkdown } from './markdown'
import { type PhraseUsage } from './store'

/** Case folded and spaces collapsed, so what is compared is only the words. */
const fold = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/** The first letter or digit of each word — a word's first character, past any quote or bracket. */
const initials = (text: string) =>
  text
    .split(' ')
    .map(word => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .join('')

/**
 * The phrases what has been typed could be, **in three groups**:
 *
 *  1. those that **begin** with it — "i want a dr" finding "I want a drink";
 *  2. those that **hold it anywhere** — "drink" finding "Can I have a drink";
 *  3. those whose **first words' initials** it spells, from the first word on —
 *     "ttyl" finding "Talk to you later", which is what a texting acronym is.
 *
 * Case does not matter and the spaces around it do not either, and a phrase
 * appears once, in the first group it belongs to. **Within each group the one
 * used most recently comes first** — what somebody said last is what they are
 * likeliest to be reaching for again — and phrases nobody has used keep the
 * order they were handed in.
 *
 * Matched against the words rather than the markup, so `**Help** me` is found by
 * typing "help": nobody types the asterisks they can see are not there.
 */
export function search(phrases: Phrase[], typed: string, usage: PhraseUsage): Phrase[] {
  const q = fold(typed)
  if (!q) return []

  const groups: Phrase[][] = [[], [], []]
  for (const p of phrases) {
    const text = fold(stripMarkdown(p.text))
    if (text.startsWith(q)) groups[0].push(p)
    else if (text.includes(q)) groups[1].push(p)
    else if (initials(text).startsWith(q)) groups[2].push(p)
  }

  // A stable sort, and a phrase with no use recorded reads as used at the dawn
  // of time — so those stay in the order given, after every one that has been.
  const at = (p: Phrase) => usage[p.id]?.at ?? 0
  return groups.flatMap(group => [...group].sort((a, b) => at(b) - at(a)))
}
