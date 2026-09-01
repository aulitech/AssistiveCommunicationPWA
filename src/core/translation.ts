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

/** A language's translations, keyed by the exact words that would be spoken. */
export interface TranslationTable {
  language: string
  of: Record<string, string>
}

/** "es-ES" and "es" are the same table. DeepL and a shipped file both want the base. */
export const baseLanguage = (tag: string) => tag.slice(0, 2).toLowerCase()

/** Whether a language means translating at all. Empty, or English, does not. */
export const needsTranslation = (tag: string) =>
  Boolean(tag) && baseLanguage(tag) !== SOURCE_LANGUAGE

/**
 * The shipped tables, once loaded, and the ones remembered from before.
 *
 * Held in memory rather than read back per phrase, because the answer has to be
 * available *synchronously*: the emergency bar speaks the moment it is pressed,
 * and a promise there is a phrase that arrives after somebody needed it.
 */
const shipped = new Map<string, Record<string, string>>()
let remembered: Record<string, Record<string, string>> | null = null

function cache(): Record<string, Record<string, string>> {
  if (remembered) return remembered
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
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
  const base = baseLanguage(tag)
  if (!needsTranslation(tag) || shipped.has(base)) return
  try {
    const table = (await import(`./imports/translations/${base}.json`)) as { default: TranslationTable }
    shipped.set(base, table.default?.of ?? {})
  } catch {
    shipped.set(base, {})
  }
}

/**
 * What this text says in that language, or undefined if nobody knows yet.
 *
 * Synchronous on purpose — see above.
 */
export function translationFor(text: string, tag: string): string | undefined {
  if (!needsTranslation(tag)) return undefined
  const base = baseLanguage(tag)
  return shipped.get(base)?.[text] ?? cache()[base]?.[text]
}

/** Keep a translation, so it is instant the next time and free the time after. */
export function rememberTranslation(text: string, tag: string, translated: string) {
  if (!needsTranslation(tag) || !translated) return
  const base = baseLanguage(tag)
  const all = cache()
  const forLanguage = { ...(all[base] ?? {}), [text]: translated }

  // Oldest first, which insertion order gives for free. A board is the same
  // phrases over and over, so this bites rarely and only on the ones nobody has
  // said for a long time.
  const keys = Object.keys(forLanguage)
  if (keys.length > CACHE_LIMIT) {
    for (const old of keys.slice(0, keys.length - CACHE_LIMIT)) delete forLanguage[old]
  }

  all[base] = forLanguage
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // A full or unavailable store costs speed, never speech.
  }
}

/** Test seam, and what a factory reset reaches. */
export function forgetTranslations() {
  shipped.clear()
  remembered = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do, and nothing that matters.
  }
}

/** For tests and for the tool that builds the shipped tables. */
export function seedTranslations(tag: string, of: Record<string, string>) {
  shipped.set(baseLanguage(tag), of)
}
