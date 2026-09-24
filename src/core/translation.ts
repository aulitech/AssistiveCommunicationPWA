// Saying a phrase in a language the board is not written in.
//
// The board stays as it was written — somebody reads their own phrases in their
// own words — and what comes *out* is translated, so a listener who does not
// share that language hears it. Which is why this sits in front of `speak()`
// rather than anywhere near the grid.
//
// Two sources, in this order:
//
//   * **The table Peri ships**, translated ahead of time and lazily loaded for
//     whichever language is chosen. Instant, offline, free, and — the part that
//     matters most — **already in hand when the emergency bar is pressed**,
//     which is the one surface that will not wait on a network.
//   * **What has been translated before**, kept on the device. That is where a
//     phrase somebody wrote themselves ends up, and a composed message with it.
//
// Anything found in neither is a job for `translate/client.ts`, and if that
// cannot be done the words are spoken as they were written. **Never silence,
// and never a guess**: an untranslated phrase said in the original is a phrase
// the listener may not follow, which is recoverable; a phrase not said at all
// is not.

/** What the shipped phrase table is written in. */
export const SOURCE_LANGUAGE = 'en'

/** How many remembered translations to keep per language. */
const CACHE_LIMIT = 2000

const KEY = 'peri_translations'
import { reportFailure } from './report'
import { storageKey, writeKey } from './store'

/** A language's translations, keyed by the exact words that would be spoken. */
export interface TranslationTable {
  language: string
  of: Record<string, string>
}

/** "es-ES" and "es" are the same table. */
export const baseLanguage = (tag: string) => tag.slice(0, 2).toLowerCase()

/** Whether a language means translating at all. Empty, or plain English, does not. */
export const needsTranslation = (tag: string) => Boolean(tag) && baseLanguage(tag) !== SOURCE_LANGUAGE

/** Which shipped table a language reads, or null when it needs none. */
export const tableFor = (tag: string): string | null => (needsTranslation(tag) ? baseLanguage(tag) : null)

/** What to ask the translation service for, or null when there is nothing to translate. */
export const translationTarget = (tag: string): string | null => tableFor(tag)

/**
 * The shipped tables, once loaded, and the ones remembered from before.
 *
 * Held in memory rather than read back per phrase, because the answer has to be
 * available *synchronously*: the emergency bar speaks the moment it is pressed,
 * and a promise there is a phrase that arrives after somebody needed it.
 */
const shipped = new Map<string, Record<string, string>>()
let remembered: Record<string, Record<string, string>> | null = null
/**
 * Whose translations those are. What somebody has translated is a record of
 * what they said, so it is kept with their board — and read again, rather than
 * carried over, the moment a different board is open.
 */
let rememberedFrom = ''

function cache(): Record<string, Record<string, string>> {
  const key = storageKey(KEY)
  if (remembered && rememberedFrom === key) return remembered
  rememberedFrom = key
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(KEY)) ?? '{}') as unknown
    remembered = isTable(raw) ? raw : {}
  } catch {
    remembered = {}
  }
  return remembered
}

function isTable(v: unknown): v is Record<string, Record<string, string>> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  return Object.values(v).every(
    inner =>
      typeof inner === 'object' &&
      inner !== null &&
      !Array.isArray(inner) &&
      Object.values(inner).every(t => typeof t === 'string'),
  )
}

/**
 * Bring a language's shipped translations into memory.
 *
 * Lazily, and only the one chosen: the tables are a hundred kilobytes each and
 * a board speaks one language at a time. A language Peri ships nothing for is
 * not a failure — everything it says will simply come from the cache or the
 * translator, and it is remembered as empty so it is not asked for again.
 */
export async function loadTranslations(tag: string): Promise<void> {
  const table = tableFor(tag)
  if (!table || shipped.has(table)) return
  try {
    const loaded = (await import(`./imports/translations/${table}.json`)) as { default: TranslationTable }
    shipped.set(table, loaded.default?.of ?? {})
  } catch {
    // Peri ships nothing for this language. Not a failure — everything simply
    // comes from the cache or the service — but worth saying, because a
    // language that quietly translates nothing looks like a broken setting.
    reportFailure('translations/load', `Peri ships no translations for ${table}`)
    shipped.set(table, {})
  }
}

/**
 * What this text says in that language, or undefined if nobody knows yet.
 *
 * Synchronous on purpose — see above.
 */
export function translationFor(text: string, tag: string): string | undefined {
  const table = tableFor(tag)
  if (!table) return undefined
  return shipped.get(table)?.[text] ?? cache()[table]?.[text]
}

/** Keep a translation, so it is instant the next time and free the time after. */
export function rememberTranslation(text: string, tag: string, translated: string) {
  const table = tableFor(tag)
  if (!table || !translated) return
  const all = cache()
  const forLanguage = { ...(all[table] ?? {}), [text]: translated }

  // Oldest first, which insertion order gives for free. A board is the same
  // phrases over and over, so this bites rarely and only on the ones nobody has
  // said for a long time.
  const keys = Object.keys(forLanguage)
  if (keys.length > CACHE_LIMIT) {
    for (const old of keys.slice(0, keys.length - CACHE_LIMIT)) delete forLanguage[old]
  }

  all[table] = forLanguage
  // A full or unavailable store costs speed here, never speech — every phrase
  // is paid for again on the next reload. But a store too full for this is too
  // full for the board as well, so it says so like any other write.
  writeKey(storageKey(KEY), JSON.stringify(all))
}

/** Test seam, and what a factory reset reaches. */
export function forgetTranslations() {
  shipped.clear()
  remembered = null
  try {
    localStorage.removeItem(storageKey(KEY))
  } catch {
    // Nothing to do, and nothing that matters.
  }
}

/** For tests and for the tool that builds the shipped tables. */
export function seedTranslations(tag: string, of: Record<string, string>) {
  const table = tableFor(tag)
  if (table) shipped.set(table, of)
}
