// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { FORMER_IDS } from '../phrases'
import { PHRASE_SORT_KEY, RECENT_KEY, SENT_KEY, TRANSLATED_KEY, USAGE_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── Messages already said ─────────────────────────────────────────────────────
// A conversation repeats itself, and rebuilding a sentence word by word is the
// slowest thing this app asks of anyone. What was said once is kept so it can be
// said again in one dwell.
//
// Its own key, and deliberately not part of a backup: this is a record of what
// somebody actually said — what hurts, what they want, who they were asking for
// — and a backup is a file made to be handed to somebody else. `src/backup.test.ts`
// holds it to that.

export interface SentMessage {
  id: string
  text: string
}

/** Newest first, so the grid opens on what was just said. */
const SENT_LIMIT = 200

export function loadSent(): SentMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(SENT_KEY)) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (m: unknown): m is SentMessage =>
          typeof m === 'object' && m !== null && typeof (m as SentMessage).text === 'string',
      )
      .map((m: SentMessage) => ({ id: String(m.id ?? m.text), text: m.text }))
      .slice(0, SENT_LIMIT)
  } catch {
    return []
  }
}

export function saveSent(messages: SentMessage[]) {
  writeKey(storageKey(SENT_KEY), JSON.stringify(messages))
}

// ── What was said in another language ─────────────────────────────────────────
// The Sent list's twin, and shaped after it for the same reasons — see
// `talk/use-translated.ts`. A record of what somebody actually said, so it has
// its own key, outside the three things a backup is built from.

/** One phrase, as it came out of the speaker. */
export interface Translated {
  id: string
  /**
   * The board's own words, drawn under the translation.
   *
   * Without it the tab is a wall of text the person using the board cannot
   * read — every other surface here is in their own language, and this is the
   * one that is not.
   */
  source: string
  /** What actually came out, in the other language. */
  text: string
  /**
   * The language setting it was said under — **the tag, not the table.**
   *
   * `es-MX` reads the `es` table and is spoken as `es-MX`, so the table cannot
   * say which voice to use or what to call it in a list. The tag can.
   */
  tag: string
}

/** Newest first, so the tab opens on what was just said. */
const TRANSLATED_LIMIT = 200

export function loadTranslated(): Translated[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(TRANSLATED_KEY)) ?? '[]')
    if (!Array.isArray(raw)) return []
    return (raw as Translated[])
      .filter(
        (t): t is Translated =>
          typeof t === 'object' &&
          t !== null &&
          typeof t.source === 'string' &&
          typeof t.text === 'string' &&
          typeof t.tag === 'string' &&
          // A phrase with no words is a cell nobody can read or reach, and an
          // entry with no language cannot be spoken as anything.
          t.text.trim() !== '' &&
          t.tag !== '',
      )
      .map(t => ({ id: String(t.id ?? `${t.tag} ${t.source}`), source: t.source, text: t.text, tag: t.tag }))
      .slice(0, TRANSLATED_LIMIT)
  } catch {
    return []
  }
}

export function saveTranslated(list: Translated[]) {
  writeKey(storageKey(TRANSLATED_KEY), JSON.stringify(list))
}

/**
 * The list after saying `source` as `text`.
 *
 * **Keyed by the words and the language together**, so one phrase said in two
 * languages is two entries — which is the whole of what "preserve the language"
 * has to mean here. Saying the same thing again in the same language moves it
 * back to the top rather than listing it twice, exactly as the Sent list does:
 * the tab is for reaching a sentence again, and ten copies makes that harder.
 *
 * **The order *is* the recency.** No timestamp, for the reason the Sent list
 * keeps none — a list held newest-first already answers the only question asked
 * of it, and a clock in storage is one more thing to be wrong.
 */
export function addTranslated(list: Translated[], source: string, text: string, tag: string): Translated[] {
  const said = text.trim()
  if (!said || !tag) return list
  const same = (t: Translated) => t.source === source && t.tag === tag
  const existing = list.find(same)
  return [
    existing
      ? { ...existing, text: said }
      : { id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source, text: said, tag },
    ...list.filter(t => !same(t)),
  ].slice(0, TRANSLATED_LIMIT)
}

/**
 * The list after saying `text`. Saying the same thing twice moves it back to the
 * top rather than listing it twice — the list is for reaching a sentence again,
 * and ten copies of "yes please" makes that harder, not easier.
 */
export function addSent(messages: SentMessage[], text: string): SentMessage[] {
  const trimmed = text.trim()
  if (!trimmed) return messages
  const rest = messages.filter(m => m.text !== trimmed)
  const existing = messages.find(m => m.text === trimmed)
  return [
    existing ?? { id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed },
    ...rest,
  ].slice(0, SENT_LIMIT)
}

// ── The last choices made ─────────────────────────────────────────────────────
// Filing phrases is done in runs — several into one category, several in one
// voice — and starting each from the alphabetically first category, or from no
// voice, means making the same choice over and over.
//
// Its own key, and not in a backup: it is where somebody had got to, not
// anything they made.

export interface RecentChoices {
  category?: string
  voice?: string
}

export function loadRecent(): RecentChoices {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(RECENT_KEY)) ?? '{}')
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
    return { category: str(raw?.category), voice: str(raw?.voice) }
  } catch {
    return {}
  }
}

export function saveRecent(recent: RecentChoices) {
  writeKey(storageKey(RECENT_KEY), JSON.stringify(recent))
}

// ── How much each phrase is used ──────────────────────────────────────────────
// What the board is arranged by when it is arranged by use. Two numbers per
// phrase: how many times, and when last.
//
// Its own key, and deliberately not part of a backup, for the reason the Sent
// list is not: this is a record of what somebody actually said and how often —
// which body part hurts, who they keep asking for — and a backup is a file made
// to be handed to somebody else. `tests/core/backup.test.ts` holds it to that.
//
// Keyed by phrase id, so it is bounded by the size of the board rather than by
// how long somebody has been talking. A deleted phrase's entry is dropped with
// it; an id naming nothing is skipped anyway.

export interface PhraseUse {
  /** Times used. Never zero — an unused phrase has no entry at all. */
  count: number
  /** When last used, as a millisecond timestamp. */
  at: number
}

export type PhraseUsage = Record<string, PhraseUse>

/** The four arrangements the grid offers — see `core/sort.ts`. */
export type PhraseSort = 'custom' | 'alpha' | 'recent' | 'frequent'

const PHRASE_SORTS_STORED: readonly PhraseSort[] = ['custom', 'alpha', 'recent', 'frequent']

export function loadUsage(): PhraseUsage {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(USAGE_KEY)) ?? '{}')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    const usage: PhraseUsage = {}
    for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      const { count, at } = entry as Partial<PhraseUse>
      // A count of nought is an entry that says nothing, and a negative one is
      // damage; either would sort above a phrase that has actually been used.
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue
      if (typeof at !== 'number' || !Number.isFinite(at)) continue
      // A copy dropped when the table was collapsed counts towards the phrase
      // it was folded into — see `foldFormerCopies`.
      const into = FORMER_IDS.get(id) ?? id
      const was = usage[into]
      usage[into] = was
        ? { count: was.count + Math.floor(count), at: Math.max(was.at, at) }
        : { count: Math.floor(count), at }
    }
    return usage
  } catch {
    return {}
  }
}

export function saveUsage(usage: PhraseUsage) {
  writeKey(storageKey(USAGE_KEY), JSON.stringify(usage))
}

/** The usage after `id` is used once more. */
export function recordUse(usage: PhraseUsage, id: string, at: number = Date.now()): PhraseUsage {
  if (!id) return usage
  return { ...usage, [id]: { count: (usage[id]?.count ?? 0) + 1, at } }
}

/** The usage with `id` gone, for a phrase that has been deleted. */
export function forgetUse(usage: PhraseUsage, id: string): PhraseUsage {
  if (!(id in usage)) return usage
  const next = { ...usage }
  delete next[id]
  return next
}

/**
 * Which of the four each tab is showing, keyed by the tab's filter id — a
 * category's name, or `all`.
 *
 * **One per category, not one for the board.** The categories are not alike:
 * a long reference list is worth having alphabetically, a short one worth
 * having by what gets used, and a category somebody arranged by hand is worth
 * leaving as they arranged it. A single setting makes each of those the wrong
 * answer everywhere else. What pays for it is that the control says which order
 * is on — in its glyph and in its name — so arriving at a tab that is sorted
 * differently is readable rather than mysterious.
 *
 * A tab nobody has chosen for shows the board's own order, which is where Peri
 * ships and the one nobody has to have set anything to get.
 *
 * A view rather than content, exactly as `loadAliasSort` is: its own small key,
 * and it never travels in a backup or a snapshot. The *arrangement* a category
 * holds is content and does travel — see `PhraseStore.phraseOrder`.
 */
export type PhraseSorts = Record<string, PhraseSort>

/**
 * Where every tab starts: **what gets used most, first.**
 *
 * A board arrives with over two thousand phrases in the order a table
 * happens to list them, and the one somebody wants next is nearly always one
 * they have wanted before. Nothing is lost by starting here — a phrase nobody
 * has used keeps the place the board gave it, so a board that has not been used
 * yet looks exactly as it always did, and it sorts itself out as it is spoken.
 */
export const DEFAULT_SORT: PhraseSort = 'frequent'

const readSort = (raw: unknown): PhraseSort | undefined => PHRASE_SORTS_STORED.find(s => s === raw)

export function loadPhraseSorts(): PhraseSorts {
  const stored = localStorage.getItem(storageKey(PHRASE_SORT_KEY))
  if (!stored) return {}
  // Written before there was one per tab, when the whole board shared a single
  // order. It was chosen while looking at some tab, and All is the one the
  // board opens on, so that is where it lands rather than being thrown away.
  const legacy = readSort(stored)
  // Its one order went to All, which is the tab the board opens on — unless it
  // was the board's own order, which All no longer offers.
  if (legacy) return legacy === 'custom' || legacy === DEFAULT_SORT ? {} : { all: legacy }
  try {
    const raw: unknown = JSON.parse(stored)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    const sorts: PhraseSorts = {}
    for (const [filter, value] of Object.entries(raw as Record<string, unknown>)) {
      const sort = readSort(value)
      // Storing the default says nothing.
      if (sort && sort !== DEFAULT_SORT) sorts[filter] = sort
    }
    return sorts
  } catch {
    return {}
  }
}

export function savePhraseSorts(sorts: PhraseSorts) {
  writeKey(storageKey(PHRASE_SORT_KEY), JSON.stringify(sorts))
}

/**
 * What a tab is showing. A tab nobody has chosen for shows `DEFAULT_SORT`.
 *
 * **`canArrange` is false for All**, which offers no Custom order: a hand
 * arrangement belongs to one category and All shows every category at once, so
 * there is no arrangement for it to be in. A stored `custom` there is read as
 * the default rather than left as a state its own picker could not get back to.
 */
export function sortFor(sorts: PhraseSorts, filter: string, canArrange = true): PhraseSort {
  const stored = sorts[filter]
  if (!stored) return DEFAULT_SORT
  return stored === 'custom' && !canArrange ? DEFAULT_SORT : stored
}

/**
 * The orders after choosing one for a tab. The default drops the entry rather
 * than storing it, so a record that is all defaults is an empty one — the rule
 * the phrase arrangements follow, and what keeps a tab nobody has touched out of
 * storage.
 */
export function setSortFor(sorts: PhraseSorts, filter: string, sort: PhraseSort): PhraseSorts {
  const next = { ...sorts }
  if (sort === DEFAULT_SORT) delete next[filter]
  else next[filter] = sort
  return next
}
