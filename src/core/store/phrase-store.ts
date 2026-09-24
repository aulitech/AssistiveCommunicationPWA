// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { FORMER_IDS, LIBRARY, PHRASES } from '../phrases'
import { PHRASE_STORE_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── Phrase store (user edits persisted to localStorage) ───────────────────────
// v2: ids are content-derived rather than array indices, so saved edits no
// longer reattach to a neighbouring phrase when phrasetable.json changes.

/**
 * A phrase somebody wrote. **`category` is where it lives, not a tab it is
 * filed under**: Library for anything on the board, Emergency for a button on
 * the bar. Which categories show it is `PhraseStore.members`.
 */
export interface StoredPhrase {
  id: string
  text: string
  category: string
}

/**
 * **Every phrase lives in Library**, and a category is a list of references to
 * Library phrases, in an order of its own — see
 * [Categories as references](docs/decisions/categories-as-references.md).
 */
export interface PhraseStore {
  custom: StoredPhrase[] // user-added phrases
  overrides: Record<string, string> // id → new text
  hidden: string[] // ids removed by user
  /**
   * Category name → the Library phrases it holds, by id, **in its own order**
   * — which is the category's Custom order. A category with none is an empty
   * list, kept so one can be made first and filled afterwards. Library is not
   * one of these: it holds everything, in `libraryOrder`.
   */
  members: Record<string, string[]>
  /**
   * id → language → the voice that phrase is said in, overriding the one in
   * settings. A board can then carry more than one voice: somebody quoting
   * another person, a child's name in their own voice, a phrase that has to cut
   * through noise.
   *
   * **Keyed by language, because a voice is a language.** A board that speaks
   * Spanish on Tuesday and English on Wednesday needs both answers kept, or
   * choosing a Spanish voice for a phrase throws away the English one it had —
   * and the phrase comes back on Wednesday read by a Spanish synthesiser.
   *
   * The key is the language tag as `settings.language` holds it, `''` included:
   * empty is not "any language", it is the board following whatever the device
   * speaks, which is a setting like any other and the one most boards are in.
   * A store written before this was per-language reads its single voice into
   * that key — see `readVoiceOverrides`.
   */
  voiceOverrides: Record<string, Record<string, string>>
  /**
   * The user's own arrangement of the category tabs — the ones somebody made;
   * Library is pinned in front of them and is not arranged. Kept
   * whether or not it is the one on show, so switching to A–Z and back returns
   * the tabs to exactly where they were rather than making the user rebuild it.
   * Names missing from it sit at the end, alphabetically, so a category added
   * later has a settled place without every addition having to rewrite the
   * order.
   */
  categoryOrder: string[]
  /** Which of the two arrangements is in effect. */
  categorySort: 'alpha' | 'custom'
  /**
   * The user's own arrangement of the emergency bar, by phrase id. Empty means
   * the order the phrases come in, which is the one Peri ships. Unlike the
   * categories there is no second arrangement to switch to: the shipped order is
   * the order they happen to be written in, and nobody is looking for it back.
   *
   * Ids rather than text, so rewording an emergency phrase leaves it where it
   * is — which for a bar somebody reaches for without looking is the point.
   */
  emergencyOrder: string[]
  /**
   * Library's own arrangement, by phrase id — its Custom order. Ids it has
   * never heard of sit at the end in the board's order, so a phrase added
   * later lands after the ones already arranged. Ids, so rewording a phrase
   * leaves it where it was put.
   */
  libraryOrder: string[]
}

export const emptyStore = (): PhraseStore => ({
  custom: [],
  overrides: {},
  hidden: [],
  members: {},
  voiceOverrides: {},
  categoryOrder: [],
  categorySort: 'alpha',
  emergencyOrder: [],
  libraryOrder: [],
})

/**
 * A phrase's voices, out of a store that may predate them being per-language.
 *
 * The old shape was one voice per phrase, chosen with no way to say which
 * language it was for. It is read into the `''` key — the board following the
 * device — because that is the setting a board is in unless somebody changed
 * it, and so is very nearly always the language that voice was picked under.
 * The cost of being wrong is a phrase falling back to the app's voice at some
 * other language, which is recoverable by choosing one; the cost of guessing
 * the other way would be a Spanish phrase read by an English voice.
 */
export function readVoiceOverrides(raw: unknown): Record<string, Record<string, string>> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, Record<string, string>> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (value) out[id] = { '': value }
    } else if (value && typeof value === 'object') {
      const byLanguage: Record<string, string> = {}
      for (const [tag, voice] of Object.entries(value as Record<string, unknown>)) {
        if (typeof voice === 'string' && voice) byLanguage[tag] = voice
      }
      if (Object.keys(byLanguage).length > 0) out[id] = byLanguage
    }
  }
  return out
}

/**
 * Give one phrase a voice for one language, or take that language's away.
 *
 * **Every other language's is kept**, which is the whole of what "a voice per
 * language" means — choosing a Spanish voice for a phrase must not throw away
 * the English one it already had, or the board comes back on Wednesday reading
 * English words with a Spanish synthesiser.
 *
 * Pure, and here rather than inside `useBoard`, because that is the only way
 * the rule above can be tested without driving the whole app through two
 * language changes to watch one object.
 */
export function setVoiceOverride(
  overrides: Record<string, Record<string, string>>,
  id: string,
  language: string,
  voiceURI: string | undefined,
): Record<string, Record<string, string>> {
  const byLanguage = { ...overrides[id] }
  if (voiceURI) byLanguage[language] = voiceURI
  else delete byLanguage[language]

  const next = { ...overrides }
  // An empty record left behind would be a phrase that reads as having a voice
  // to everything that counts them — the audio warm-up, a backup.
  if (Object.keys(byLanguage).length > 0) next[id] = byLanguage
  else delete next[id]
  return next
}

/**
 * The voice a phrase is said in when the board speaks `language`, or nothing.
 *
 * **Exact, with no falling back to another language.** A phrase given an
 * English voice has not been given a Spanish one, and reading Spanish words
 * with an English synthesiser is worse than reading them with the board's own
 * voice — which is what nothing here means.
 */
export function voiceOverrideFor(
  overrides: Record<string, Record<string, string>>,
  id: string,
  language: string,
): string | undefined {
  return overrides[id]?.[language]
}

/**
 * A per-category arrangement out of whatever was stored. Null where there is
 * nothing usable, so the caller falls back rather than writing an empty object
 * over a default. A category whose list holds no strings is dropped outright: an
 * empty arrangement and no arrangement mean the same thing here.
 */
export function readPhraseOrder(raw: unknown): Record<string, string[]> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const order: Record<string, string[]> = {}
  for (const [category, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue
    const kept = ids.filter((id): id is string => typeof id === 'string' && id !== '')
    if (kept.length > 0) order[category] = kept
  }
  return order
}

/** A list of strings, anything else in it dropped. */
const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null

/** A record of strings, anything else in it dropped. */
const stringRecord = (v: unknown): Record<string, string> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(
        Object.entries(v).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    : null

/** A phrase somebody wrote, whole, or not at all. */
const isStoredPhrase = (v: unknown): v is StoredPhrase =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as StoredPhrase).id === 'string' &&
  typeof (v as StoredPhrase).text === 'string' &&
  typeof (v as StoredPhrase).category === 'string'

/**
 * Each category's references out of whatever was stored: names to lists of
 * ids, **an empty list kept** — an empty category is one somebody made and has
 * not filled yet. A list is held to strings, and an id listed twice once.
 */
export function readMembers(raw: unknown): Record<string, string[]> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const members: Record<string, string[]> = {}
  for (const [category, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!category || category === LIBRARY || category === EMERGENCY || !Array.isArray(ids)) continue
    members[category] = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))]
  }
  return members
}

const EMERGENCY = 'Emergency'

/**
 * The phrase store, **every part of it checked**.
 *
 * Whatever is in storage may not have been written by this release: an older
 * one, a hand-edited file, another device synchronizing. A phrase whose words
 * were not words used to reach the parser while the board was drawn, and the
 * board threw — on every load, since the damage stays put, so *Start again* on
 * the crash screen would only have started the crash again. So each list and
 * record keeps the entries of the right shape and drops the rest: one damaged
 * phrase costs that phrase, never the board.
 *
 * **A store written before categories were references is turned into one** —
 * see `fromFiled`.
 */
export function loadPhraseStore(): PhraseStore {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(PHRASE_STORE_KEY)) ?? '{}')
    const categoryOrder = stringList(raw.categoryOrder) ?? []
    const shared = {
      overrides: stringRecord(raw.overrides) ?? {},
      hidden: stringList(raw.hidden) ?? [],
      voiceOverrides: readVoiceOverrides(raw.voiceOverrides) ?? {},
      categoryOrder,
      // Stores written before the two arrangements were told apart have an
      // order and no flag; an order they took the trouble to make is the one
      // they were looking at.
      categorySort:
        raw.categorySort === 'alpha' || raw.categorySort === 'custom'
          ? raw.categorySort
          : categoryOrder.length > 0
            ? ('custom' as const)
            : ('alpha' as const),
      emergencyOrder: stringList(raw.emergencyOrder) ?? [],
    }
    const custom: StoredPhrase[] = Array.isArray(raw.custom) ? raw.custom.filter(isStoredPhrase) : []
    const store: PhraseStore =
      raw.members !== undefined
        ? {
            ...shared,
            custom: custom.map(c => (c.category === EMERGENCY ? c : { ...c, category: LIBRARY })),
            members: readMembers(raw.members) ?? {},
            libraryOrder: stringList(raw.libraryOrder) ?? [],
          }
        : fromFiled({
            ...shared,
            custom,
            categoryRenames: stringRecord(raw.categoryRenames) ?? {},
            categories: stringList(raw.categories) ?? [],
            categoryOverrides: stringRecord(raw.categoryOverrides) ?? {},
            phraseOrder: readPhraseOrder(raw.phraseOrder) ?? {},
          })
    // Written before the table was collapsed, so this is the first look at it
    // since — see `foldFormerCopies`, and `TABLE` for why that can be told.
    return foldFormerCopies(store, FORMER_IDS, typeof raw.table !== 'number')
  } catch {
    return emptyStore()
  }
}

/**
 * A store as it was before categories were references: each phrase **filed
 * under one category** — its own, one it was moved to, or the one a rename
 * showed its category as — and each category's arrangement kept on the side.
 * Still read, from storage and from a file.
 */
export interface FiledStore extends Omit<PhraseStore, 'members' | 'libraryOrder'> {
  categoryRenames: Record<string, string>
  categories: string[]
  categoryOverrides: Record<string, string>
  phraseOrder: Record<string, string[]>
}

/**
 * **A filed store as references.** Every phrase goes to Library, where it
 * always showed as well; each one filed under another category is referred to
 * by that category, in the order the tab showed them — its arrangement first,
 * then the board's order — so nothing on any tab moves. A category somebody
 * made and left empty stays, empty. Library's arrangement is Library's order.
 *
 * A move written against a copy dropped when the table was collapsed counts
 * for the phrase it became, unless that phrase was moved itself.
 */
export function fromFiled(filed: FiledStore): PhraseStore {
  const rename = (name: string) => filed.categoryRenames[name] ?? name
  const moved = new Map<string, string>()
  for (const [id, category] of Object.entries(filed.categoryOverrides)) {
    const into = FORMER_IDS.get(id) ?? id
    if (into === id || !moved.has(into)) moved.set(into, category)
  }
  const hidden = new Set(filed.hidden)
  const members: Record<string, string[]> = {}
  const refer = (category: string, id: string) => {
    if (category === LIBRARY || category === EMERGENCY || hidden.has(id)) return
    ;(members[category] ??= []).push(id)
  }
  for (const name of filed.categories) if (name !== LIBRARY && name !== EMERGENCY) members[name] ??= []
  for (const p of PHRASES) {
    const category = moved.get(p.id)
    if (category) refer(category, p.id)
  }
  for (const c of filed.custom) {
    if (c.category === EMERGENCY) continue
    refer(moved.get(c.id) ?? rename(c.category), c.id)
  }
  for (const [category, ids] of Object.entries(members)) {
    const arranged = filed.phraseOrder[category] ?? []
    const rank = new Map(arranged.map((id, i) => [id, i]))
    members[category] = [
      ...ids.filter(id => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!),
      ...ids.filter(id => !rank.has(id)),
    ]
  }
  return {
    custom: filed.custom.map(c => (c.category === EMERGENCY ? c : { ...c, category: LIBRARY })),
    overrides: filed.overrides,
    hidden: filed.hidden,
    voiceOverrides: filed.voiceOverrides,
    members,
    categoryOrder: filed.categoryOrder.filter(name => name in members),
    categorySort: filed.categorySort,
    emergencyOrder: filed.emergencyOrder,
    libraryOrder: filed.phraseOrder[LIBRARY] ?? [],
  }
}

/**
 * Which phrase table the store was last written against, and in which shape.
 * **2 is the one with every phrase in Library**; a store without a number was
 * written against the one before, with forty-odd categories and the same words
 * in several of them. **3 holds categories as references** — see `fromFiled`.
 *
 * Stamped on the way out rather than kept in `PhraseStore`, because nothing
 * but `loadPhraseStore` has any use for it: it says whether the store has been
 * read since the collapse, which is the one thing `foldFormerCopies` cannot
 * work out from the store itself.
 */
const TABLE = 3

export function savePhraseStore(s: PhraseStore) {
  writeKey(storageKey(PHRASE_STORE_KEY), JSON.stringify({ ...s, table: TABLE }))
}

/** Whether a record holds this key itself, rather than by inheritance. */
const holds = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key)

/**
 * Everything written against a copy of a phrase that was dropped when the
 * table was collapsed, **moved onto the phrase it was folded into** — see
 * `TableRow.merged` in `core/phrases.ts`.
 *
 * The phrase's own entry wins wherever both have one: its wording, its voice
 * for a language. What only a dropped copy had comes across, so a copy
 * somebody reworded or gave a voice is not undone by the collapse. Every source
 * of a store passes through here — storage, a backup, a sheet, another device —
 * so an id from before is never left naming nothing.
 *
 * **Hiding is the one that needs to know when.** Somebody who deleted one
 * copy of a phrase and kept another still had it on their board, and
 * collapsing the two must not take it away — so the first time a store written
 * before the collapse is read (`unhide`), a phrase comes back if any copy of it
 * was showing. Only that once: afterwards it is hidden because they hid it, and
 * a copy that no longer exists is not a reason to bring it back.
 */
export function foldFormerCopies(
  store: PhraseStore,
  former: ReadonlyMap<string, string> = FORMER_IDS,
  unhide = false,
): PhraseStore {
  const into = (id: string) => former.get(id) ?? id
  const fold = <T>(record: Record<string, T>, merge: (kept: T, from: T) => T): Record<string, T> => {
    const out: Record<string, T> = {}
    for (const [id, value] of Object.entries(record)) if (!former.has(id)) out[id] = value
    for (const [id, value] of Object.entries(record)) {
      if (!former.has(id)) continue
      const kept = into(id)
      out[kept] = holds(out, kept) ? merge(out[kept], value) : value
    }
    return out
  }
  const folded = (ids: string[]) => [...new Set(ids.map(into))]

  const hidden = new Set(store.hidden)
  const showing = new Set<string>()
  if (unhide) for (const [copy, kept] of former) if (!hidden.has(copy)) showing.add(kept)

  return {
    ...store,
    overrides: fold(store.overrides, kept => kept),
    voiceOverrides: fold(store.voiceOverrides, (kept, from) => ({ ...from, ...kept })),
    hidden: store.hidden.filter(id => !former.has(id) && !showing.has(id)),
    emergencyOrder: folded(store.emergencyOrder),
    libraryOrder: folded(store.libraryOrder),
    members: Object.fromEntries(Object.entries(store.members).map(([category, ids]) => [category, folded(ids)])),
  }
}
