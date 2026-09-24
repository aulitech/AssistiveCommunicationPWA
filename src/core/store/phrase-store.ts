// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { PHRASE_STORE_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── Phrase store (user edits persisted to localStorage) ───────────────────────
// v2: ids are content-derived rather than array indices, so saved edits no
// longer reattach to a neighbouring phrase when phrasetable.json changes.

export interface StoredPhrase {
  id: string
  text: string
  category: string
}

export interface PhraseStore {
  custom: StoredPhrase[] // user-added phrases
  overrides: Record<string, string> // id → new text
  hidden: string[] // ids removed by user
  /**
   * Source category name → the name to show. A single entry renames a whole
   * category, including the built-in phrases in it, which per-phrase overrides
   * could not do.
   */
  categoryRenames: Record<string, string>
  /** Categories the user created. Kept so one can exist before it has phrases. */
  categories: string[]
  /** id → category, for a single phrase moved out of the one it came in. */
  categoryOverrides: Record<string, string>
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
   * The user's own arrangement of the category tabs. Kept whether or not it is
   * the one on show, so switching to A–Z and back returns the tabs to exactly
   * where they were rather than making the user rebuild it. Names missing from
   * it sit at the end, alphabetically, so a category added later has a settled
   * place without every addition having to rewrite the order.
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
   * The user's own arrangement of the phrases **inside one category**, by
   * phrase id, keyed by the category's shown name.
   *
   * Per category rather than one list for the whole board, because that is the
   * unit somebody actually arranges — "put the food I ask for most at the top
   * of Food" — and because one flat list would have to name every phrase in the
   * table the first time anything moved. It is why **All** cannot be arranged:
   * its phrases come from every category at once, and ranking them against each
   * other's arrangements would interleave orders that were never about one
   * another.
   *
   * Ids, so rewording a phrase leaves it where it was put — the same reason
   * `emergencyOrder` is ids.
   */
  phraseOrder: Record<string, string[]>
}

export const emptyStore = (): PhraseStore => ({
  custom: [],
  overrides: {},
  hidden: [],
  categoryRenames: {},
  categories: [],
  categoryOverrides: {},
  voiceOverrides: {},
  categoryOrder: [],
  categorySort: 'alpha',
  emergencyOrder: [],
  phraseOrder: {},
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
 * The phrase store, **every part of it checked**.
 *
 * Whatever is in storage may not have been written by this release: an older
 * one, a hand-edited file, another device synchronizing. A phrase whose words
 * were not words used to reach the parser while the board was drawn, and the
 * board threw — on every load, since the damage stays put, so *Start again* on
 * the crash screen would only have started the crash again. So each list and
 * record keeps the entries of the right shape and drops the rest: one damaged
 * phrase costs that phrase, never the board.
 */
export function loadPhraseStore(): PhraseStore {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(PHRASE_STORE_KEY)) ?? '{}')
    const base = emptyStore()
    const categoryOrder = stringList(raw.categoryOrder) ?? base.categoryOrder
    return {
      custom: Array.isArray(raw.custom) ? raw.custom.filter(isStoredPhrase) : base.custom,
      overrides: stringRecord(raw.overrides) ?? base.overrides,
      hidden: stringList(raw.hidden) ?? base.hidden,
      categoryRenames: stringRecord(raw.categoryRenames) ?? base.categoryRenames,
      categories: stringList(raw.categories) ?? base.categories,
      categoryOverrides: stringRecord(raw.categoryOverrides) ?? base.categoryOverrides,
      voiceOverrides: readVoiceOverrides(raw.voiceOverrides) ?? base.voiceOverrides,
      categoryOrder,
      // Stores written before the two arrangements were told apart have an
      // order and no flag; an order they took the trouble to make is the one
      // they were looking at.
      categorySort:
        raw.categorySort === 'alpha' || raw.categorySort === 'custom'
          ? raw.categorySort
          : categoryOrder.length > 0
            ? 'custom'
            : 'alpha',
      emergencyOrder: stringList(raw.emergencyOrder) ?? base.emergencyOrder,
      phraseOrder: readPhraseOrder(raw.phraseOrder) ?? base.phraseOrder,
    }
  } catch {
    return emptyStore()
  }
}

export function savePhraseStore(s: PhraseStore) {
  writeKey(storageKey(PHRASE_STORE_KEY), JSON.stringify(s))
}
