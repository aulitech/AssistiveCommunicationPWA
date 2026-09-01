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

/**
 * A way of speaking that Peri knows something extra about.
 *
 * A tag is not enough on its own once regions are involved. Three different
 * questions hide inside one, and for these they have three different answers:
 * what to *say it as*, what to *translate it with*, and which shipped table it
 * reads. Anything not listed here answers all three from its base language,
 * which is right for `de-DE` and wrong for both of these.
 */
export interface SpokenVariety {
  /** What the setting holds. */
  tag: string
  label: string
  /** What `utterance.lang` is set to — not always the tag. */
  speak: string
  /** What DeepL is asked for, or **null when no service will do it**. */
  deepl: string | null
  /** Which shipped table it reads. */
  table: string
}

export const VARIETIES: SpokenVariety[] = [
  /**
   * DeepL has no Puerto Rican Spanish and nobody does — what it has is
   * `ES-419`, Latin American Spanish, which is the near side of a real divide:
   * European Spanish would give a board `vosotros` and `coger`, and the second
   * of those means something else entirely in San Juan.
   */
  { tag: 'es-PR', label: 'Spanish (Puerto Rico)', speak: 'es-PR', deepl: 'ES-419', table: 'es-419' },
  /**
   * **Patois is a language, not an accent**, and no translation service
   * supports it — DeepL carries Haitian Creole and no other. So this is the
   * case the shipped tables exist for: the phrases Peri comes with are written
   * out ahead of time, and anything somebody writes themselves is spoken as
   * they wrote it, because there is nothing to send it to.
   *
   * It is *spoken* as `en-JM`. There is no Patois voice on any device, and
   * Patois written down is close enough to English orthography that an English
   * voice reads it about right — a Jamaican one, where there is one, better.
   */
  { tag: 'jam', label: 'Jamaican Patois', speak: 'en-JM', deepl: null, table: 'jam' },
]

const varietyFor = (tag: string) => VARIETIES.find(v => v.tag.toLowerCase() === tag.toLowerCase())

/** "es-ES" and "es" are the same table, for anything not listed above. */
export const baseLanguage = (tag: string) => tag.slice(0, 2).toLowerCase()

/** Whether a language means translating at all. Empty, or plain English, does not. */
export const needsTranslation = (tag: string) =>
  Boolean(tag) && (Boolean(varietyFor(tag)) || baseLanguage(tag) !== SOURCE_LANGUAGE)

/** Which shipped table a language reads, or null when it needs none. */
export const tableFor = (tag: string): string | null =>
  varietyFor(tag)?.table ?? (needsTranslation(tag) ? baseLanguage(tag) : null)

/**
 * What to ask DeepL for, or **null when nothing will translate this**.
 *
 * Null is not a failure and not a missing case: Patois is a language no service
 * offers, so a phrase outside the shipped table is spoken as it was written and
 * nothing is sent anywhere.
 */
export const deeplTarget = (tag: string): string | null => {
  const variety = varietyFor(tag)
  if (variety) return variety.deepl
  return needsTranslation(tag) ? baseLanguage(tag).toUpperCase() : null
}

/** What the synthesiser is told, which is not always what the setting holds. */
export const speechTag = (tag: string): string => varietyFor(tag)?.speak ?? tag

/** How a language reads in a list, where Peri has a name of its own for it. */
export const varietyLabel = (tag: string): string | undefined => varietyFor(tag)?.label

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
  const table = tableFor(tag)
  if (!table || shipped.has(table)) return
  try {
    const loaded = (await import(`./imports/translations/${table}.json`)) as { default: TranslationTable }
    shipped.set(table, loaded.default?.of ?? {})
  } catch {
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
  const table = tableFor(tag)
  if (table) shipped.set(table, of)
}
