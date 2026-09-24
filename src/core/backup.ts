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

import { EMERGENCY_PHRASES, EMPTY_ALIASES, LIBRARY, type AliasStore, type Aliases } from './phrases'
import {
  readMembers,
  readPhraseOrder,
  readLanguage,
  readReplyModel,
  readVoiceOverrides,
  DEFAULT_SETTINGS,
  readAliases,
  SETTING_LIMITS,
  aliasesFromProfile,
  emptyStore,
  wordingKey,
  type PhraseStore,
  type Settings,
} from './store'

export const BACKUP_FORMAT = 'peri-backup'
/**
 * **2 holds categories as references** — each category a list of Library
 * phrases, in its own order. A file at 1 filed each phrase under one category,
 * and is read into references as it is parsed; see `fromVersion1`.
 */
export const BACKUP_VERSION = 2

const EMERGENCY = 'Emergency'

/** A phrase the user wrote themselves. */
export interface BackupPhrase {
  id: string
  text: string
  /** Where it lives: Library, or the emergency bar. Which categories show it is `Backup.members`. */
  category: string
  /**
   * The voices it is said in, by language, where they are not the one in
   * settings. `voice` is the same thing from a file written before voices were
   * per-language, and is still read — a backup is a file people keep.
   */
  voices?: Record<string, string>
  /** @deprecated Read, never written. Superseded by `voices`. */
  voice?: string
}

/**
 * The voices out of one entry in a file, whichever release wrote it.
 *
 * A backup is a file people keep, so the single `voice` of a file written
 * before voices were per-language is still read — into the `''` key, the board
 * following the device, for the reason `readVoiceOverrides` gives.
 */
function readVoices(entry: unknown): Record<string, string> | null {
  if (!isRecord(entry)) return null
  const byLanguage = readVoiceOverrides({ one: entry.voices ?? entry.voice })?.one
  return byLanguage && Object.keys(byLanguage).length > 0 ? byLanguage : null
}

/** A change to a phrase Peri ships. Either half may be absent. */
export interface BackupEdit {
  id: string
  /** The new wording. */
  text?: string
  /**
   * The voices it is said in, by language, where they are not the one in
   * settings. `voice` is the same thing from a file written before voices were
   * per-language, and is still read — a backup is a file people keep.
   */
  voices?: Record<string, string>
  /** @deprecated Read, never written. Superseded by `voices`. */
  voice?: string
}

export interface BackupCategories {
  order: string[]
  /** Whole-app backups only — a few categories should not decide how all of them sort. */
  sort?: 'alpha' | 'custom'
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  /** ISO 8601, and the source of the date in the filename. */
  exported: string
  /** The categories this file covers — Library and Emergency among them — or null for all of them. */
  scope: string[] | null
  added: BackupPhrase[]
  edited: BackupEdit[]
  /** Ids of phrases the user removed. */
  removed: string[]
  categories: BackupCategories
  /**
   * Each category the file covers, as the Library phrases it refers to, **in
   * its own order** — an empty list for one somebody made and has not filled.
   */
  members?: Record<string, string[]>
  /** Library's own arrangement, by phrase id, where the file covers Library. */
  libraryOrder?: string[]
  /**
   * The user's own order for the emergency bar, by phrase id. Carried only when
   * the file covers Emergency — it is a rearrangement, which is as much a thing
   * somebody did as a rewording is.
   */
  emergencyOrder?: string[]
  /** Whole-app backups only. Both of these. */
  aliases?: AliasStore
  settings?: Settings
}

export interface BackupInput {
  store: PhraseStore
  aliases: AliasStore
  settings: Settings
  /** Categories to include — Library and Emergency among them. Null, absent or empty takes the lot. */
  scope?: string[] | null
  now?: Date
}

export function buildBackup(input: BackupInput): Backup {
  const { store, aliases, settings, now = new Date() } = input
  const scope = input.scope && input.scope.length > 0 ? [...input.scope] : null
  const wanted = scope && new Set(scope)
  const covers = (name: string) => !wanted || wanted.has(name)

  // Which phrases the file is about. Library covers every phrase on the board,
  // Emergency the bar, and a category the phrases it refers to.
  const onBar = new Set([
    ...EMERGENCY_PHRASES.map(p => p.id),
    ...store.custom.filter(p => p.category === EMERGENCY).map(p => p.id),
  ])
  const referred = new Set(
    Object.entries(store.members)
      .filter(([category]) => covers(category))
      .flatMap(([, ids]) => ids),
  )
  const inScope = (id: string) =>
    !wanted || (onBar.has(id) ? covers(EMERGENCY) : covers(LIBRARY) || referred.has(id))

  const customIds = new Set(store.custom.map(p => p.id))

  // A phrase the user wrote and later reworded carries both a `custom` entry and
  // an override. The file holds the text it actually shows, so a restore needs
  // to know about only one of them.
  const added: BackupPhrase[] = store.custom
    .filter(p => inScope(p.id))
    .map(p => ({
      id: p.id,
      text: store.overrides[p.id] ?? p.text,
      category: p.category === EMERGENCY ? EMERGENCY : LIBRARY,
      ...(store.voiceOverrides[p.id] ? { voices: store.voiceOverrides[p.id] } : {}),
    }))

  const edited: BackupEdit[] = [
    ...new Set([...Object.keys(store.overrides), ...Object.keys(store.voiceOverrides)]),
  ]
    .filter(id => !customIds.has(id) && inScope(id))
    .map(id => {
      const entry: BackupEdit = { id }
      if (store.overrides[id] !== undefined) entry.text = store.overrides[id]
      if (store.voiceOverrides[id] !== undefined) entry.voices = store.voiceOverrides[id]
      return entry
    })

  const members = Object.fromEntries(Object.entries(store.members).filter(([category]) => covers(category)))

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported: now.toISOString(),
    scope,
    added,
    edited,
    removed: store.hidden.filter(inScope),
    categories: {
      order: store.categoryOrder.filter(covers),
      ...(scope ? {} : { sort: store.categorySort }),
    },
    // Left out where there is nothing to say, rather than written empty — the
    // rule the word lists follow below.
    ...(Object.keys(members).length > 0 ? { members } : {}),
    ...(covers(LIBRARY) && store.libraryOrder.length > 0 ? { libraryOrder: [...store.libraryOrder] } : {}),
    // The bar is one category's worth of phrases, so its order goes when that
    // category does — and an arrangement is all-or-nothing.
    ...(covers(EMERGENCY) && store.emergencyOrder.length > 0 ? { emergencyOrder: [...store.emergencyOrder] } : {}),
    // Lists nobody has touched are left out rather than written as an empty
    // object, so the panel does not offer someone "your word lists" when they
    // have changed none — and so replacing from a file does not quietly empty
    // the lists on the device that receives it.
    ...(scope || !hasAliases(aliases) ? {} : { aliases }),
    ...(scope ? {} : { settings }),
  }
}

const hasAliases = ({ lists, hidden }: AliasStore) => Object.keys(lists).length > 0 || hidden.length > 0

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

/** A phrase or an edit as a file has it, with the category a file at version 1 filed it under. */
type Filed<T> = T & { filedUnder: string }

function readAdded(v: unknown): Filed<BackupPhrase>[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isRecord)
    .map(p => ({
      id: str(p.id),
      text: str(p.text),
      category: str(p.category) === EMERGENCY ? EMERGENCY : LIBRARY,
      filedUnder: str(p.category),
      ...(readVoices(p) ? { voices: readVoices(p)! } : {}),
    }))
    .filter(p => p.id !== '' && p.text !== '')
}

function readEdited(v: unknown): Filed<BackupEdit>[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isRecord)
    .map(e => {
      const entry: Filed<BackupEdit> = { id: str(e.id), filedUnder: str(e.category) }
      if (typeof e.text === 'string' && e.text !== '') entry.text = e.text
      const voices = readVoices(e)
      if (voices) entry.voices = voices
      return entry
    })
    .filter(e => e.id !== '' && (e.text !== undefined || e.filedUnder !== '' || e.voices !== undefined))
}

/** Without the category a phrase or edit was filed under, which only a file at version 1 has. */
const unfiled = <T extends { filedUnder: string }>({ filedUnder: _, ...rest }: T) => rest

/**
 * **A file at version 1 as references.** Each phrase it filed under a category
 * other than Library is referred to by that category, in the order the file's
 * arrangement gave them and then the file's own; a category it made and left
 * empty is an empty list; Library's arrangement is Library's order. What it
 * renamed is not read: every name it renamed was a category Peri used to ship.
 */
function fromVersion1(
  raw: Record<string, unknown>,
  added: Filed<BackupPhrase>[],
  edited: Filed<BackupEdit>[],
): { members: Record<string, string[]>; libraryOrder: string[] } {
  const categories = isRecord(raw.categories) ? raw.categories : {}
  const arranged = readPhraseOrder(raw.phraseOrder) ?? {}
  const members: Record<string, string[]> = {}
  const own = (name: string) => name !== '' && name !== LIBRARY && name !== EMERGENCY
  for (const name of strings(categories.created)) if (own(name)) members[name] ??= []
  for (const { id, filedUnder } of [...added, ...edited]) {
    if (own(filedUnder) && !(members[filedUnder] ??= []).includes(id)) members[filedUnder].push(id)
  }
  for (const [category, ids] of Object.entries(members)) {
    const rank = new Map((arranged[category] ?? []).map((id, i) => [id, i]))
    members[category] = [
      ...ids.filter(id => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!),
      ...ids.filter(id => !rank.has(id)),
    ]
  }
  return { members, libraryOrder: arranged[LIBRARY] ?? [] }
}

/**
 * `readAliases` reads both shapes — the store, and the bare object of lists a
 * file written before a list could be deleted carries — so this is only about
 * whether the field was there at all.
 */
function readAliasStore(v: unknown): AliasStore | undefined {
  return isRecord(v) ? readAliases(v) : undefined
}

/**
 * A file written before the lists were the user's to edit carries a `profile`
 * instead — three name fields and a contact list. They were always these same
 * lists behind the scenes, so they are read as such rather than dropped.
 */
function readLegacyProfile(v: unknown): AliasStore | undefined {
  if (!isRecord(v)) return undefined
  const carried = aliasesFromProfile(v)
  return Object.keys(carried.lists).length > 0 ? carried : undefined
}

/**
 * A file does not get to set a value the settings panel could not. A dwell time
 * of zero would fire every control the instant the pointer crossed it, which for
 * someone driving Peri by gaze is the difference between a keyboard and a
 * minefield — and they would have no working control left to undo it with.
 */
/** A BCP-47 tag: a language, optionally narrowed by script or region. */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

function readSettings(v: unknown): Settings | undefined {
  if (!isRecord(v)) return undefined
  const num = (x: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback
  return {
    phraseDwellMs: num(v.phraseDwellMs, SETTING_LIMITS.phraseDwellMs, DEFAULT_SETTINGS.phraseDwellMs),
    actionDwellMs: num(v.actionDwellMs, SETTING_LIMITS.actionDwellMs, DEFAULT_SETTINGS.actionDwellMs),
    repeatDelayMs: num(v.repeatDelayMs, SETTING_LIMITS.repeatDelayMs, DEFAULT_SETTINGS.repeatDelayMs),
    // Shape-checked rather than taken as written. It cannot be held to the
    // languages *this* device speaks — the setting travels, and the device that
    // wrote it may have voices this one has never had — but a language tag is a
    // language tag, and anything that is not one would only ever be handed
    // straight to the synthesiser.
    language: LANGUAGE_TAG.test(str(v.language)) ? readLanguage(str(v.language)) : DEFAULT_SETTINGS.language,
    voiceURI: str(v.voiceURI),
    // Same shape check, once per key. `''` is a real key — the board following
    // the device — so it is allowed through where a tag is otherwise required.
    voicesByLanguage: isRecord(v.voicesByLanguage)
      ? Object.fromEntries(
          Object.entries(v.voicesByLanguage).filter(
            ([tag, voice]) => (tag === '' || LANGUAGE_TAG.test(tag)) && typeof voice === 'string' && voice,
          ) as [string, string][],
        )
      : DEFAULT_SETTINGS.voicesByLanguage,
    volume: num(v.volume, SETTING_LIMITS.volume, DEFAULT_SETTINGS.volume),
    rate: num(v.rate, SETTING_LIMITS.rate, DEFAULT_SETTINGS.rate),
    // Falls back to the default like every other field rather than to false:
    // a file that says nothing about a setting is a file that says nothing, and
    // the default is on.
    autoSpeak: typeof v.autoSpeak === 'boolean' ? v.autoSpeak : DEFAULT_SETTINGS.autoSpeak,
    keyboard: typeof v.keyboard === 'boolean' ? v.keyboard : DEFAULT_SETTINGS.keyboard,
    zoom: num(v.zoom, SETTING_LIMITS.zoom, DEFAULT_SETTINGS.zoom),
    // Held to the list this build knows, exactly as `loadSettings` holds it. A
    // file is the more likely of the two to name a model from a later release.
    replyModel: readReplyModel(v.replyModel),
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
  const aliases = readAliasStore(raw.aliases) ?? readLegacyProfile(raw.profile)
  const settings = readSettings(raw.settings)
  const added = readAdded(raw.added)
  const edited = readEdited(raw.edited)
  const { members, libraryOrder } =
    version === 1
      ? fromVersion1(raw, added, edited)
      : { members: readMembers(raw.members) ?? {}, libraryOrder: strings(raw.libraryOrder) }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version,
      exported: str(raw.exported),
      // An empty list would mean "cover nothing", which no export ever writes.
      scope: scope && scope.length > 0 ? scope : null,
      added: added.map(unfiled),
      edited: edited.map(unfiled).filter(e => e.text !== undefined || e.voices !== undefined),
      removed: strings(raw.removed),
      categories: {
        order: strings(categories.order).filter(name => name !== LIBRARY),
        ...(categories.sort === 'alpha' || categories.sort === 'custom' ? { sort: categories.sort } : {}),
      },
      ...(Object.keys(members).length > 0 ? { members } : {}),
      ...(libraryOrder.length > 0 ? { libraryOrder } : {}),
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
    ...Object.keys(backup.members ?? {}),
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
      Object.keys(backup.members ?? {}).length === 0 &&
      backup.categories.order.length === 0 &&
      (backup.emergencyOrder?.length ?? 0) === 0 &&
      (backup.libraryOrder?.length ?? 0) === 0 &&
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
  aliases: AliasStore
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
  const voiceOverrides = { ...base.store.voiceOverrides }

  // Importing the same file twice, or two files from the same person, should not
  // leave two of everything. An id matches the very same phrase; the same
  // wording in the same place — Library, or the bar — catches the same phrase
  // written again on another device, where it was given an id of its own. **The
  // file's categories then refer to the phrase already here**, which is why the
  // one it would have added is remembered as that one.
  const byId = new Map(custom.map(p => [p.id, p]))
  // The separator is a NUL, the one character neither a place nor a phrase can
  // contain. Written as an escape rather than as the byte itself: a raw NUL in
  // the source makes this whole file binary to grep.
  const key = (text: string, category: string) => `${category}\u0000${wordingKey(text)}`
  const had = new Map(custom.map(p => [key(overrides[p.id] ?? p.text, p.category), p.id]))
  const sameAs = new Map<string, string>()

  for (const phrase of backup.added) {
    const existing = byId.get(phrase.id)
    const already = had.get(key(phrase.text, phrase.category))
    if (existing) {
      existing.text = phrase.text
      existing.category = phrase.category
    } else if (already !== undefined) {
      sameAs.set(phrase.id, already)
      continue
    } else {
      const copy = { id: phrase.id, text: phrase.text, category: phrase.category }
      custom.push(copy)
      byId.set(copy.id, copy)
    }
    had.set(key(phrase.text, phrase.category), phrase.id)
    // An override left over from a phrase that once had this id would otherwise
    // mask the text just imported — the store reads the override first.
    delete overrides[phrase.id]
    const voices = readVoices(phrase)
    if (voices) voiceOverrides[phrase.id] = voices
    else delete voiceOverrides[phrase.id]
  }

  for (const edit of backup.edited) {
    if (edit.text !== undefined) overrides[edit.id] = edit.text
    const editVoices = readVoices(edit)
    if (editVoices) voiceOverrides[edit.id] = editVoices
  }

  /** What the file's order adds to one already here: its own, on the end, each once. */
  const appended = (here: string[], from: string[]) => [...here, ...from.filter(x => !here.includes(x))]

  // What the file refers to is appended behind what this device's categories
  // already hold, so a device with nothing of its own takes the file's exactly
  // and one that has arranged a category does not have it rearranged
  // underneath them. A category the file says nothing about keeps what it had.
  const members = { ...base.store.members }
  for (const [category, ids] of Object.entries(backup.members ?? {})) {
    if (category === LIBRARY || category === EMERGENCY) continue
    members[category] = appended(members[category] ?? [], [...new Set(ids.map(id => sameAs.get(id) ?? id))])
  }

  const store: PhraseStore = {
    custom,
    overrides,
    voiceOverrides,
    hidden: replacing ? [...new Set(backup.removed)] : base.store.hidden,
    members,
    categoryOrder: appended(base.store.categoryOrder, backup.categories.order),
    categorySort: backup.categories.sort ?? base.store.categorySort,
    // Same rule for both arrangements: what the file arranged is appended.
    emergencyOrder: appended(base.store.emergencyOrder, backup.emergencyOrder ?? []),
    libraryOrder: appended(
      base.store.libraryOrder,
      (backup.libraryOrder ?? []).map(id => sameAs.get(id) ?? id),
    ),
  }

  return {
    store,
    aliases: mergeAliases(base.aliases, backup.aliases, replacing),
    // Settings ride along only in a whole-app backup, and someone importing one
    // asked for the setup it holds — including the dwell time it was tuned to.
    settings: backup.settings ?? base.settings,
  }
}

function mergeAliases(base: AliasStore, incoming: AliasStore | undefined, replacing: boolean): AliasStore {
  if (!incoming) return base
  if (replacing) return incoming
  // Merging adds and never takes away, exactly as it does for phrases: a file
  // somebody else made must not be able to delete a word off a list on your
  // device, and **its `hidden` is not applied at all** — hiding a list is a
  // removal, and only replace applies removals. A list in both keeps this
  // device's words and gains the file's.
  const lists: Aliases = { ...base.lists }
  for (const [key, words] of Object.entries(incoming.lists)) {
    lists[key] = [...new Set([...(base.lists[key] ?? []), ...words])]
  }
  return { lists, hidden: base.hidden }
}
