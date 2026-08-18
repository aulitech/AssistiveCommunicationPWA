// Export and import: everything a user has made of Peri, or a few categories of
// it, as one JSON file.
//
// Everything a user has done lives in this browser and nowhere else. Clearing
// site data, a new tablet, a different browser — any of them takes all of it,
// and for someone whose board is how they speak that is not a small loss. This
// is the way out and the way back in.
//
// Two things shape the format:
//
//  * **It is a diff, not a dump.** Peri ships two thousand phrases with the app;
//    copying them into a file so they can be restored onto a copy of Peri that
//    already has them would make every backup large and slow for no gain. What
//    goes in the file is what the user did — added, reworded, moved, removed,
//    rearranged — plus their details and settings. Phrase ids hash the source
//    text, so an id in a backup still names the same phrase in a later release,
//    and one that names nothing is skipped rather than restored as a ghost.
//
//  * **It is data in, data out.** Nothing here touches localStorage. The app
//    hands in what it has and puts back what comes out, so the format can be
//    tested without a browser, and a rejected import cannot leave the store
//    half-written.

import { EMPTY_ALIASES, type Aliases } from './phrases'
import {
  DEFAULT_SETTINGS,
  SETTING_LIMITS,
  aliasesFromProfile,
  emptyStore,
  type PhraseStore,
  type Settings,
} from './store'

export const BACKUP_FORMAT = 'peri-backup'
export const BACKUP_VERSION = 1

/** Where an imported phrase goes when the file does not say. */
export const IMPORTED_CATEGORY = 'Imported'

/** A phrase the user wrote themselves. */
export interface BackupPhrase {
  id: string
  text: string
  category: string
  /** The voice it is said in, when it is not the one in settings. */
  voice?: string
}

/** A change to a phrase Peri ships. Either half may be absent. */
export interface BackupEdit {
  id: string
  /** The new wording. */
  text?: string
  /** The category it was moved to. */
  category?: string
  /** The voice it is said in, when it is not the one in settings. */
  voice?: string
}

export interface BackupCategories {
  created: string[]
  renamed: Record<string, string>
  order: string[]
  /** Whole-app backups only — a few categories should not decide how all of them sort. */
  sort?: 'alpha' | 'custom'
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  /** ISO 8601, and the source of the date in the filename. */
  exported: string
  /** The categories this file covers, or null for all of them. */
  scope: string[] | null
  added: BackupPhrase[]
  edited: BackupEdit[]
  /** Ids of phrases the user removed. */
  removed: string[]
  categories: BackupCategories
  /**
   * The user's own order for the emergency bar, by phrase id. Carried only when
   * the file covers Emergency — it is a rearrangement, which is as much a thing
   * somebody did as a rewording is.
   */
  emergencyOrder?: string[]
  /** Whole-app backups only. Both of these. */
  aliases?: Aliases
  settings?: Settings
}

export interface BackupInput {
  store: PhraseStore
  aliases: Aliases
  settings: Settings
  /**
   * The category each phrase shows under, by id — hidden phrases included.
   * Exporting one category needs a category for phrases that are not on screen:
   * one the user removed still belongs to the category it came from.
   */
  categoryById: Map<string, string>
  /** Categories to include. Null, absent or empty takes the lot. */
  scope?: string[] | null
  now?: Date
}

export function buildBackup(input: BackupInput): Backup {
  const { store, aliases, settings, categoryById, now = new Date() } = input
  const scope = input.scope && input.scope.length > 0 ? [...input.scope] : null
  const wanted = scope && new Set(scope)
  const inScope = (category: string | undefined) => !wanted || (category !== undefined && wanted.has(category))
  const categoryOf = (id: string) => categoryById.get(id)

  const customIds = new Set(store.custom.map(p => p.id))

  // A phrase the user wrote and later reworded carries both a `custom` entry and
  // an override. The file holds the text it actually shows, so a restore needs
  // to know about only one of them.
  const added: BackupPhrase[] = store.custom
    .filter(p => inScope(categoryOf(p.id) ?? p.category))
    .map(p => ({
      id: p.id,
      text: store.overrides[p.id] ?? p.text,
      category: categoryOf(p.id) ?? p.category,
      ...(store.voiceOverrides[p.id] ? { voice: store.voiceOverrides[p.id] } : {}),
    }))

  const edited: BackupEdit[] = [
    ...new Set([
      ...Object.keys(store.overrides),
      ...Object.keys(store.categoryOverrides),
      ...Object.keys(store.voiceOverrides),
    ]),
  ]
    .filter(id => !customIds.has(id) && inScope(categoryOf(id)))
    .map(id => {
      const entry: BackupEdit = { id }
      if (store.overrides[id] !== undefined) entry.text = store.overrides[id]
      if (store.categoryOverrides[id] !== undefined) entry.category = store.categoryOverrides[id]
      if (store.voiceOverrides[id] !== undefined) entry.voice = store.voiceOverrides[id]
      return entry
    })

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported: now.toISOString(),
    scope,
    added,
    edited,
    removed: store.hidden.filter(id => inScope(categoryOf(id))),
    categories: {
      created: store.categories.filter(inScope),
      // Keyed by the name a category had, valued by the name it shows under; it
      // is the second of those the user picked, so that is what scope means.
      renamed: Object.fromEntries(Object.entries(store.categoryRenames).filter(([, shown]) => inScope(shown))),
      order: store.categoryOrder.filter(inScope),
      ...(scope ? {} : { sort: store.categorySort }),
    },
    // The bar is one category's worth of phrases, so its order goes when that
    // category does — and an arrangement is all-or-nothing, so it is not
    // filtered down the way the lists above are.
    ...(inScope('Emergency') && store.emergencyOrder.length > 0
      ? { emergencyOrder: [...store.emergencyOrder] }
      : {}),
    // Lists nobody has touched are left out rather than written as an empty
    // object, so the panel does not offer someone "your word lists" when they
    // have changed none — and so replacing from a file does not quietly empty
    // the lists on the device that receives it.
    ...(scope || !hasAliases(aliases) ? {} : { aliases }),
    ...(scope ? {} : { settings }),
  }
}

const hasAliases = (aliases: Aliases) => Object.keys(aliases).length > 0

// ── Reading a file back ───────────────────────────────────────────────────────
// Anything can be dropped into a file picker, including a backup half-written by
// a browser that ran out of quota. Nothing below throws and nothing trusts a
// field: what can be read is kept, what cannot is dropped, and a file that is
// not a Peri backup at all is turned away with a reason the user can act on.

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []

const stringMap = (v: unknown): Record<string, string> => {
  if (!isRecord(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v)) {
    if (k !== '' && typeof val === 'string') out[k] = val
  }
  return out
}

function readAdded(v: unknown): BackupPhrase[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isRecord)
    .map(p => ({
      id: str(p.id),
      text: str(p.text),
      category: str(p.category) || IMPORTED_CATEGORY,
      ...(typeof p.voice === 'string' && p.voice ? { voice: p.voice } : {}),
    }))
    .filter(p => p.id !== '' && p.text !== '')
}

function readEdited(v: unknown): BackupEdit[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isRecord)
    .map(e => {
      const entry: BackupEdit = { id: str(e.id) }
      if (typeof e.text === 'string' && e.text !== '') entry.text = e.text
      if (typeof e.category === 'string' && e.category !== '') entry.category = e.category
      if (typeof e.voice === 'string' && e.voice !== '') entry.voice = e.voice
      return entry
    })
    .filter(e => e.id !== '' && (e.text !== undefined || e.category !== undefined || e.voice !== undefined))
}

function readAliases(v: unknown): Aliases | undefined {
  if (!isRecord(v)) return undefined
  const out: Aliases = {}
  for (const [key, value] of Object.entries(v)) {
    const name = str(key).trim().toLowerCase()
    if (name) out[name] = strings(value)
  }
  return out
}

/**
 * A file written before the lists were the user's to edit carries a `profile`
 * instead — three name fields and a contact list. They were always these same
 * lists behind the scenes, so they are read as such rather than dropped.
 */
function readLegacyProfile(v: unknown): Aliases | undefined {
  if (!isRecord(v)) return undefined
  const carried = aliasesFromProfile(v)
  return Object.keys(carried).length > 0 ? carried : undefined
}

/**
 * A file does not get to set a value the settings panel could not. A dwell time
 * of zero would fire every control the instant the pointer crossed it, which for
 * someone driving Peri by gaze is the difference between a keyboard and a
 * minefield — and they would have no working control left to undo it with.
 */
function readSettings(v: unknown): Settings | undefined {
  if (!isRecord(v)) return undefined
  const num = (x: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback
  return {
    phraseDwellMs: num(v.phraseDwellMs, SETTING_LIMITS.phraseDwellMs, DEFAULT_SETTINGS.phraseDwellMs),
    actionDwellMs: num(v.actionDwellMs, SETTING_LIMITS.actionDwellMs, DEFAULT_SETTINGS.actionDwellMs),
    repeatDelayMs: num(v.repeatDelayMs, SETTING_LIMITS.repeatDelayMs, DEFAULT_SETTINGS.repeatDelayMs),
    voiceURI: str(v.voiceURI),
    volume: num(v.volume, SETTING_LIMITS.volume, DEFAULT_SETTINGS.volume),
    rate: num(v.rate, SETTING_LIMITS.rate, DEFAULT_SETTINGS.rate),
    // Falls back to the default like every other field rather than to false:
    // a file that says nothing about a setting is a file that says nothing, and
    // the default is on.
    autoSpeak: typeof v.autoSpeak === 'boolean' ? v.autoSpeak : DEFAULT_SETTINGS.autoSpeak,
    zoom: num(v.zoom, SETTING_LIMITS.zoom, DEFAULT_SETTINGS.zoom),
  }
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file can't be read — it isn't a Peri backup." }
  }

  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: "That isn't a Peri backup." }
  }

  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0
  if (version < 1) return { ok: false, error: "That backup is damaged — it doesn't say which version it is." }
  if (version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup was made by a newer version of Peri. Update Peri, then try again.' }
  }

  const categories = isRecord(raw.categories) ? raw.categories : {}
  const scope = Array.isArray(raw.scope) ? strings(raw.scope) : null
  const aliases = readAliases(raw.aliases) ?? readLegacyProfile(raw.profile)
  const settings = readSettings(raw.settings)

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version,
      exported: str(raw.exported),
      // An empty list would mean "cover nothing", which no export ever writes.
      scope: scope && scope.length > 0 ? scope : null,
      added: readAdded(raw.added),
      edited: readEdited(raw.edited),
      removed: strings(raw.removed),
      categories: {
        created: strings(categories.created),
        renamed: stringMap(categories.renamed),
        order: strings(categories.order),
        ...(categories.sort === 'alpha' || categories.sort === 'custom' ? { sort: categories.sort } : {}),
      },
      ...(strings(raw.emergencyOrder).length > 0 ? { emergencyOrder: strings(raw.emergencyOrder) } : {}),
      ...(aliases ? { aliases } : {}),
      ...(settings ? { settings } : {}),
    },
  }
}

// ── Describing one ────────────────────────────────────────────────────────────

export interface BackupSummary {
  scope: string[] | null
  added: number
  edited: number
  removed: number
  /** Distinct categories the file has anything to say about. */
  categories: number
  aliases: boolean
  settings: boolean
  /** Nothing to export, or nothing an import would do. */
  empty: boolean
}

export function summarize(backup: Backup): BackupSummary {
  const names = new Set<string>([
    ...backup.added.map(p => p.category),
    ...backup.edited.map(e => e.category ?? '').filter(Boolean),
    ...backup.categories.created,
    ...Object.values(backup.categories.renamed),
    ...backup.categories.order,
    ...(backup.scope ?? []),
  ])
  const summary = {
    scope: backup.scope,
    added: backup.added.length,
    edited: backup.edited.length,
    removed: backup.removed.length,
    categories: names.size,
    aliases: backup.aliases !== undefined,
    settings: backup.settings !== undefined,
  }
  return {
    ...summary,
    empty:
      summary.added === 0 &&
      summary.edited === 0 &&
      summary.removed === 0 &&
      backup.categories.created.length === 0 &&
      Object.keys(backup.categories.renamed).length === 0 &&
      backup.categories.order.length === 0 &&
      (backup.emergencyOrder?.length ?? 0) === 0 &&
      !summary.aliases &&
      !summary.settings,
  }
}

/** Sentence for a summary, in the order a reader cares about. */
export function describeBackup(summary: BackupSummary): string {
  const parts: string[] = []
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  if (summary.added) parts.push(`${plural(summary.added, 'phrase')} you added`)
  if (summary.edited) parts.push(`${plural(summary.edited, 'edit')}`)
  if (summary.removed) parts.push(`${plural(summary.removed, 'phrase')} you removed`)
  if (summary.aliases) parts.push('your word lists')
  if (summary.settings) parts.push('your settings')
  if (parts.length === 0) return 'Nothing yet — no changes of your own to save.'
  return parts.join(', ')
}

const slug = (name: string) => name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'category'

export function backupFilename(backup: Backup): string {
  // Falls back to today rather than to the string `Invalid Date` when a
  // hand-edited file has no date on it.
  const date = /^\d{4}-\d{2}-\d{2}/.exec(backup.exported)?.[0] ?? new Date().toISOString().slice(0, 10)
  const scope = backup.scope
  if (!scope) return `peri-backup-${date}.json`
  if (scope.length === 1) return `peri-${slug(scope[0])}-${date}.json`
  return `peri-${scope.length}-categories-${date}.json`
}

/** The JSON that gets downloaded or copied. Indented — a backup is readable. */
export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

// ── Putting one back ──────────────────────────────────────────────────────────

export type ImportMode = 'merge' | 'replace'

export interface AppState {
  store: PhraseStore
  aliases: Aliases
  settings: Settings
}

/**
 * Replacing means making this device match the file, so a file covering a few
 * categories must not be allowed to do it — everything it says nothing about
 * would go.
 */
export const canReplace = (backup: Backup) => backup.scope === null

/**
 * The state after importing. The two modes differ in one deliberate way beyond
 * the obvious:
 *
 *  * **Merge** brings in everything the file adds and never takes a phrase away.
 *    Removals are the one change with no undo in the app, so a shared file does
 *    not get to make them on someone else's device.
 *  * **Replace** makes the device match the file, removals included.
 */
export function applyBackup(backup: Backup, current: AppState, mode: ImportMode): AppState {
  const replacing = mode === 'replace'
  const base: AppState = replacing
    ? { store: emptyStore(), aliases: EMPTY_ALIASES, settings: DEFAULT_SETTINGS }
    : current

  const custom = base.store.custom.map(p => ({ ...p }))
  const overrides = { ...base.store.overrides }
  const categoryOverrides = { ...base.store.categoryOverrides }
  const voiceOverrides = { ...base.store.voiceOverrides }

  // Importing the same file twice, or two files from the same person, should not
  // leave two of everything. An id matches the very same phrase; text and
  // category together catch the same phrase written again on another device,
  // where it was given an id of its own.
  const byId = new Map(custom.map(p => [p.id, p]))
  // The separator is a NUL, the one character neither a category name nor a
  // phrase can contain — a space or a colon would let one pair collide with
  // another. Written as an escape rather than as the byte itself: a raw NUL in
  // the source makes this whole file binary to grep, and a search over it then
  // answers nothing rather than saying it cannot.
  const key = (text: string, category: string) => `${category}\u0000${text}`
  const seen = new Set(custom.map(p => key(p.text, p.category)))

  for (const phrase of backup.added) {
    const existing = byId.get(phrase.id)
    if (existing) {
      existing.text = phrase.text
      existing.category = phrase.category
    } else if (!seen.has(key(phrase.text, phrase.category))) {
      const copy = { ...phrase }
      custom.push(copy)
      byId.set(copy.id, copy)
    }
    seen.add(key(phrase.text, phrase.category))
    // An override left over from a phrase that once had this id would otherwise
    // mask the text just imported — the store reads the override first.
    delete overrides[phrase.id]
    delete categoryOverrides[phrase.id]
    if (phrase.voice) voiceOverrides[phrase.id] = phrase.voice
    else delete voiceOverrides[phrase.id]
  }

  for (const edit of backup.edited) {
    if (edit.text !== undefined) overrides[edit.id] = edit.text
    if (edit.category !== undefined) categoryOverrides[edit.id] = edit.category
    if (edit.voice !== undefined) voiceOverrides[edit.id] = edit.voice
  }

  const order = [...base.store.categoryOrder]
  for (const name of backup.categories.order) {
    if (!order.includes(name)) order.push(name)
  }

  // Same rule as the categories above: what the file arranged is appended, so a
  // device with no arrangement of its own takes the file's exactly, and one that
  // has arranged its bar already does not have it rearranged underneath them.
  const emergencyOrder = [...base.store.emergencyOrder]
  for (const id of backup.emergencyOrder ?? []) {
    if (!emergencyOrder.includes(id)) emergencyOrder.push(id)
  }

  const store: PhraseStore = {
    custom,
    overrides,
    categoryOverrides,
    voiceOverrides,
    hidden: replacing ? [...new Set(backup.removed)] : base.store.hidden,
    categoryRenames: { ...base.store.categoryRenames, ...backup.categories.renamed },
    categories: [...new Set([...base.store.categories, ...backup.categories.created])],
    categoryOrder: order,
    categorySort: backup.categories.sort ?? base.store.categorySort,
    emergencyOrder,
  }

  return {
    store,
    aliases: mergeAliases(base.aliases, backup.aliases, replacing),
    // Settings ride along only in a whole-app backup, and someone importing one
    // asked for the setup it holds — including the dwell time it was tuned to.
    settings: backup.settings ?? base.settings,
  }
}

function mergeAliases(base: Aliases, incoming: Aliases | undefined, replacing: boolean): Aliases {
  if (!incoming) return base
  if (replacing) return incoming
  // Merging adds and never takes away, exactly as it does for phrases: a file
  // somebody else made must not be able to delete a word off a list on your
  // device. A list in both keeps this device's words and gains the file's.
  const merged: Aliases = { ...base }
  for (const [key, words] of Object.entries(incoming)) {
    merged[key] = [...new Set([...(base[key] ?? []), ...words])]
  }
  return merged
}
