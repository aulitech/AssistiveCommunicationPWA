// Everything Peri keeps between sessions, and the shapes it keeps it in.
//
// Split out of App.tsx so `src/backup.ts` can be written against the same
// definitions the app itself runs on. A second copy of these shapes would drift
// the first time one of them changed, and an export that no longer matches the
// store is a backup that silently restores nothing.

import { EMPTY_ALIASES, type AliasStore, type Aliases } from './phrases'
import { newDeviceId } from './sync'

// Four of these storage keys still say `dwellspeak_`, the app's former name.
// They are deliberately not renamed: everything a user has — their phrases,
// their edits, their dwell times — lives under these keys and nowhere else, and
// renaming them without a migration would silently empty the app for everyone
// already using it. The name is cosmetic; the data is not.
const SETTINGS_KEY = 'dwellspeak_settings'
const PHRASE_STORE_KEY = 'dwellspeak_phrase_store_v2'
const PROFILE_KEY = 'dwellspeak_profile' // read once, to carry an old profile forward
const ALIASES_KEY = 'peri_aliases'
const ALIAS_SORT_KEY = 'peri_alias_sort'
const USER_KEY = 'dwellspeak_user'
const ELEVENLABS_KEY = 'peri_elevenlabs'
const TRANSLATE_KEY = 'peri_translate'
const TRANSLATIONS_KEY = 'peri_translations'
const SENT_KEY = 'peri_sent'
const RECENT_KEY = 'peri_recent'
const SYNC_KEY = 'peri_sync'

// ── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  phraseDwellMs: number
  actionDwellMs: number
  /**
   * How long between repeats while a repeating control is held — the scroll
   * nudges, the filter arrows, the settings spinners.
   *
   * The wait before the *first* fire is `actionDwellMs`, the same as any other
   * control; this is only the gap between that one and the next. Held apart from
   * the dwell time because they answer different questions: the dwell is how long
   * somebody needs to settle on a target, and this is how fast they want to
   * travel once they have. Somebody with a slow, deliberate gaze may want a long
   * dwell and quick repeats, and the two were a single hardcoded pair of numbers
   * until this existed.
   */
  repeatDelayMs: number
  /**
   * The language the board is spoken in, as a BCP-47 tag. Empty follows the
   * device, which is what Peri did before this existed.
   *
   * It is what speaks when nothing more specific has been said — a chosen voice
   * carries its own language and wins. Its real work is on the day a `voiceURI`
   * names a voice this device has never heard of: they travel between devices
   * and they are platform strings, so a board set up on a Mac arrives on a phone
   * naming nothing, and without a language the phone falls back to whatever the
   * *system* speaks. That is how an English board ends up read aloud in the
   * voice of another language entirely.
   */
  language: string // empty = whatever the device speaks
  voiceURI: string // empty = default
  volume: number // 0–1
  rate: number // 0.5–2
  /** Speak each selected phrase immediately instead of composing a message. */
  autoSpeak: boolean
  /**
   * How big the text is, as a multiple of the browser's own default. 1 is
   * normal.
   *
   * Every size in the stylesheet is in `rem`, so this is a single number applied
   * to the root font-size and everything written follows it — the phrases, the
   * message, the tabs, the guide. It is not a browser zoom: a browser zoom
   * scales the whole page, which on a board fixed to the height of the screen
   * means fewer phrases and more scrolling. This grows only what is read.
   */
  zoom: number
}

export const DEFAULT_SETTINGS: Settings = {
  phraseDwellMs: 1500,
  actionDwellMs: 800,
  repeatDelayMs: 1000,
  language: '',
  voiceURI: '',
  volume: 1,
  rate: 1,
  // On, so the board talks the moment it is opened. Somebody who wants to build
  // a sentence out of several phrases turns it off; somebody who wants a button
  // to say a thing has nothing to find first.
  autoSpeak: true,
  zoom: 1,
}

/**
 * The range each numeric setting is allowed to take, matching the spinners in
 * the settings panel. Kept here rather than in the panel because an imported
 * backup has to be held to the same limits — see `parseBackup`.
 */
export const SETTING_LIMITS = {
  phraseDwellMs: { min: 500, max: 3000 },
  actionDwellMs: { min: 300, max: 2000 },
  // The floor is not a taste: a repeat fast enough to outrun a gaze user's
  // reaction takes a nudge control and turns it into a jump to the end of the
  // list, and the control they would use to slow it back down repeats too.
  //
  // The ceiling is above the default rather than equal to it. A default sitting
  // on its own limit leaves half the spinner inert, which reads as broken — and
  // somebody who wants a whole second between repeats may well want more.
  repeatDelayMs: { min: 100, max: 2000 },
  volume: { min: 0, max: 1 },
  rate: { min: 0.5, max: 2 },
  /**
   * Half again as small to twice as large. The floor is not merely a taste
   * either: text small enough to be unreadable would take the settings panel
   * down with it, and the control to put it back is written in the same text.
   */
  zoom: { min: 0.5, max: 2 },
} as const

/**
 * Everything the user set, except the mode.
 *
 * **`autoSpeak` is not carried across a load.** It is stored like the rest and
 * ignored on the way back in, so Peri opens ready to talk however it was left —
 * which is the one thing a board has to do the moment it is switched on. It is
 * a mode rather than a preference: the other two are a dwell away, and the
 * board being silent when somebody needs it is not recoverable in the same way.
 */
export function loadSettings(): Settings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'),
      autoSpeak: DEFAULT_SETTINGS.autoSpeak,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

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
   * id → the voice that phrase is said in, overriding the one in settings. A
   * board can then carry more than one voice: somebody quoting another person,
   * a child's name in their own voice, a phrase that has to cut through noise.
   */
  voiceOverrides: Record<string, string>
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
})

export function loadPhraseStore(): PhraseStore {
  try {
    const raw = JSON.parse(localStorage.getItem(PHRASE_STORE_KEY) ?? '{}')
    const base = emptyStore()
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null)
    const categoryOrder = strings(raw.categoryOrder) ?? base.categoryOrder
    return {
      custom: Array.isArray(raw.custom) ? raw.custom : base.custom,
      overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : base.overrides,
      hidden: Array.isArray(raw.hidden) ? raw.hidden : base.hidden,
      categoryRenames:
        raw.categoryRenames && typeof raw.categoryRenames === 'object' ? raw.categoryRenames : base.categoryRenames,
      categories: strings(raw.categories) ?? base.categories,
      categoryOverrides:
        raw.categoryOverrides && typeof raw.categoryOverrides === 'object'
          ? raw.categoryOverrides
          : base.categoryOverrides,
      voiceOverrides:
        raw.voiceOverrides && typeof raw.voiceOverrides === 'object'
          ? raw.voiceOverrides
          : base.voiceOverrides,
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
      emergencyOrder: strings(raw.emergencyOrder) ?? base.emergencyOrder,
    }
  } catch {
    return emptyStore()
  }
}

export function savePhraseStore(s: PhraseStore) {
  localStorage.setItem(PHRASE_STORE_KEY, JSON.stringify(s))
}

// ── Aliases ──────────────────────────────────────────────────────────────────
// The lists a phrase's slots choose from. The table ships nine of them and two
// arrive empty — `contacts` and `name` — because there is nowhere in the data to
// put a particular person's details. All of them are the user's to change now,
// and only what they changed is stored: a key that is absent follows the table.

/** Anything that is not a list of non-empty strings is not a list. */
function readLists(raw: unknown): Aliases {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Aliases = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const name = key.trim().toLowerCase()
    if (!name) continue
    out[name] = value.filter((w): w is string => typeof w === 'string' && w.trim() !== '').map(w => w.trim())
  }
  return out
}

const readNames = (raw: unknown) =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map(n => n.trim().toLowerCase()))]
    : []

/**
 * The store, from whatever is on disk.
 *
 * **A bare object of lists is read as one too.** That is the shape this was
 * before a list could be deleted, and it is what a backup written then carries.
 */
export function readAliases(raw: unknown): AliasStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_ALIASES
  const record = raw as Record<string, unknown>
  const looksLikeStore = 'lists' in record || 'hidden' in record
  return looksLikeStore
    ? { lists: readLists(record.lists), hidden: readNames(record.hidden) }
    : { lists: readLists(record), hidden: [] }
}

/**
 * The three name fields and the contact list somebody entered under **My
 * details**, which is what this panel used to be, read as the alias lists they
 * always were behind the scenes. Run once, when there is no alias store yet —
 * losing somebody's contacts to a renamed menu item would be unforgivable.
 */
export function aliasesFromProfile(raw: unknown): AliasStore {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const name = (source.name && typeof source.name === 'object' ? source.name : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const lists: Aliases = {}
  const out = { lists, hidden: [] as string[] }

  const contacts = Array.isArray(source.contacts) ? source.contacts.map(str).filter(Boolean) : []
  if (contacts.length) lists.contacts = contacts

  const given = str(name.given)
  const surname = str(name.surname)
  const nickname = str(name.nickname)
  if (given) lists['name.given'] = [given]
  if (surname) lists['name.surname'] = [surname]
  if (nickname) lists['name.nickname'] = [nickname]
  // A bare {name} read as the fullest form on offer, and still should.
  const full = [given, surname].filter(Boolean).join(' ') || nickname || given
  if (full) lists.name = [full]

  return out
}

export function loadAliases(): AliasStore {
  try {
    const stored = localStorage.getItem(ALIASES_KEY)
    if (stored !== null) return readAliases(JSON.parse(stored))
    // Nothing here yet: carry over whatever the old details panel held, once.
    const profile = localStorage.getItem(PROFILE_KEY)
    if (profile === null) return EMPTY_ALIASES
    const carried = aliasesFromProfile(JSON.parse(profile))
    saveAliases(carried)
    return carried
  } catch {
    return EMPTY_ALIASES
  }
}

export function saveAliases(a: AliasStore) {
  localStorage.setItem(ALIASES_KEY, JSON.stringify(a))
}

/**
 * Which arrangement the Aliases panel is showing, exactly as `categorySort`
 * does for the tabs: A–Z, or the order the user put the words in.
 *
 * A view rather than content, which is why it is its own small key and not part
 * of `Aliases` — the *order* is content and travels in a backup as the order of
 * each list; which of the two is being looked at does not.
 */
export function loadAliasSort(): 'custom' | 'alpha' {
  return localStorage.getItem(ALIAS_SORT_KEY) === 'alpha' ? 'alpha' : 'custom'
}

export function saveAliasSort(sort: 'custom' | 'alpha') {
  localStorage.setItem(ALIAS_SORT_KEY, sort)
}

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
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((m: unknown): m is SentMessage =>
        typeof m === 'object' && m !== null && typeof (m as SentMessage).text === 'string')
      .map((m: SentMessage) => ({ id: String(m.id ?? m.text), text: m.text }))
      .slice(0, SENT_LIMIT)
  } catch {
    return []
  }
}

export function saveSent(messages: SentMessage[]) {
  localStorage.setItem(SENT_KEY, JSON.stringify(messages))
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
  return [existing ?? { id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed }, ...rest]
    .slice(0, SENT_LIMIT)
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
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}')
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
    return { category: str(raw?.category), voice: str(raw?.voice) }
  } catch {
    return {}
  }
}

export function saveRecent(recent: RecentChoices) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

// ── A linked ElevenLabs account ───────────────────────────────────────────────
// Its own key, and deliberately not part of a backup: a backup is made to be
// shared, and the key in one hands over the account it belongs to along with
// whatever that account can be billed for. `src/backup.test.ts` holds it to
// that. What a backup does carry is the chosen voice, which on a device with no
// account of its own simply falls back to the device voice.

export interface RemoteVoice {
  id: string
  name: string
  /** What ElevenLabs files it under — premade, cloned, professional, generated. */
  collection?: string
}

export interface ElevenLabsAccount {
  apiKey: string
  /** Kept so the picker can still name the chosen voice while offline. */
  voices: RemoteVoice[]
}

/**
 * Whether two accounts are the same one, voices and all.
 *
 * Asked before writing one, because writing an account throws away the audio
 * cached under it — and a board arriving from another device carries the
 * account whether or not that is what changed. Without this, an edit to a
 * phrase on the tablet empties the phone's cache: every clip re-fetched, on the
 * user's own credits, for nothing.
 *
 * The voices count. A key re-linked can name a different set, and a picker
 * offering voices the account no longer has is a phrase that will not speak.
 */
export function sameAccount(a: ElevenLabsAccount | null, b: ElevenLabsAccount | null): boolean {
  if (a === null || b === null) return a === b
  if (a.apiKey !== b.apiKey || a.voices.length !== b.voices.length) return false
  return a.voices.every((voice, i) => voice.id === b.voices[i].id && voice.name === b.voices[i].name)
}

export function loadElevenLabs(): ElevenLabsAccount | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ELEVENLABS_KEY) ?? 'null')
    if (!raw || typeof raw.apiKey !== 'string' || !raw.apiKey) return null
    const voices: RemoteVoice[] = Array.isArray(raw.voices)
      ? raw.voices
          .filter((v: unknown): v is RemoteVoice =>
            typeof v === 'object' && v !== null && typeof (v as RemoteVoice).id === 'string')
          .map((v: RemoteVoice) => ({
            id: v.id,
            name: String(v.name ?? v.id),
            ...(typeof v.collection === 'string' && v.collection ? { collection: v.collection } : {}),
          }))
      : []
    return { apiKey: raw.apiKey, voices }
  } catch {
    return null
  }
}

export function saveElevenLabs(account: ElevenLabsAccount | null) {
  if (account) localStorage.setItem(ELEVENLABS_KEY, JSON.stringify(account))
  else localStorage.removeItem(ELEVENLABS_KEY)
}

/**
 * The translation key, for translating what Peri ships no translation for.
 *
 * Its own storage key, outside the three things `buildBackup` reads, for the
 * reason the ElevenLabs key is: **a backup is a file made to be handed to
 * somebody else**, and a key in one hands over the account. It does travel in a
 * sync snapshot, which reaches the user's own devices and nowhere else.
 */
export function loadTranslateKey(): string {
  try {
    const key = localStorage.getItem(TRANSLATE_KEY)
    return typeof key === 'string' ? key : ''
  } catch {
    return ''
  }
}

export function saveTranslateKey(key: string) {
  if (key) localStorage.setItem(TRANSLATE_KEY, key)
  else localStorage.removeItem(TRANSLATE_KEY)
}

// ── Who is signed in ─────────────────────────────────────────────────────────
// Deliberately not part of a backup: a file that could sign you in as someone
// else is a file that could sign someone else in as you.

export interface User {
  name: string
  email: string
  provider: 'google' | 'apple' | 'facebook' | 'guest'
  avatar?: string
  /**
   * The provider's own id for this person, kept because it is the only thing
   * that means "the same account" on a second device. An email can change and a
   * Facebook account often has none, so neither will do. It was thrown away
   * until synchronizing needed it; a user stored before that has none, which is
   * why `accountId` can answer null.
   */
  sub?: string
}

/**
 * What two devices have to agree on to be the same account, or null where there
 * is nothing to agree on — a guest, or somebody signed in before the id was
 * kept, who has to sign in again for sync to know who they are.
 */
export function accountId(user: User | null): string | null {
  if (!user || user.provider === 'guest') return null
  return user.sub ? `${user.provider}:${user.sub}` : null
}

export function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveUser(u: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

// ── Synchronizing ────────────────────────────────────────────────────────────

/**
 * What this device knows about synchronizing, and **none of it is in a backup.**
 *
 * The same reasoning that keeps the ElevenLabs key out of one: a backup is a
 * file made to be handed to somebody else, and the passphrase in it hands over
 * the board on every device that shares it. The flag is out for a second reason
 * — restoring somebody else's file must not switch a stranger's device on and
 * start it writing to a server.
 *
 * `updatedAt` and `dirty` are written down rather than kept in memory because a
 * device that is edited on a train and closed before it reaches a signal has to
 * remember, when it opens again, that it is the one holding the newer board.
 */
export interface SyncConfig {
  enabled: boolean
  /** Empty until somebody sets one. Sync cannot start without it. */
  passphrase: string
  /** This browser profile. Only ever shown, to say which device wrote last. */
  device: string
  /** When this device's board last changed. */
  updatedAt: number
  /** Whether that change has been sent. */
  dirty: boolean
  /** The server revision this device last saw. */
  revision: number
  /** When a sync last completed, for the line under the setting. */
  lastSyncedAt: number
  /**
   * Whether this device has settled its first exchange with the account.
   *
   * The one moment sync cannot decide by itself: a device joining an account
   * that has already synchronized a board, while holding a board of its own.
   * Both cannot be kept. Until this is true the usual rule is suspended and the
   * setting asks — see `useSync`.
   */
  joined: boolean
}

export const emptySync = (): SyncConfig => ({
  enabled: false,
  passphrase: '',
  device: newDeviceId(),
  updatedAt: 0,
  dirty: false,
  revision: 0,
  lastSyncedAt: 0,
  joined: false,
})

export function loadSync(): SyncConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null')
    if (!stored || typeof stored !== 'object') return emptySync()
    // Field by field over the defaults: a half-written record must not leave the
    // app with a passphrase and no device, which would write a board to an
    // address nothing else can find.
    const base = emptySync()
    return {
      enabled: stored.enabled === true,
      passphrase: typeof stored.passphrase === 'string' ? stored.passphrase : base.passphrase,
      device: typeof stored.device === 'string' && stored.device ? stored.device : base.device,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
      dirty: stored.dirty === true,
      revision: typeof stored.revision === 'number' ? stored.revision : 0,
      lastSyncedAt: typeof stored.lastSyncedAt === 'number' ? stored.lastSyncedAt : 0,
      joined: stored.joined === true,
    }
  } catch {
    return emptySync()
  }
}

export function saveSync(config: SyncConfig) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(config))
}

// ── Factory reset ────────────────────────────────────────────────────────────

/**
 * Everything this app has ever written down, except who is signed in.
 *
 * Listed rather than reached for with `localStorage.clear()`: this app is served
 * from an origin that may hold something it did not put there, and a reset is no
 * licence to remove somebody else's key. The list is right here beside the
 * constants it names, so a new key added above and forgotten here is a key a
 * reset leaves behind — which is the failure to watch for.
 */
const RESETTABLE_KEYS = [
  SETTINGS_KEY,
  PHRASE_STORE_KEY,
  PROFILE_KEY,
  ALIASES_KEY,
  ALIAS_SORT_KEY,
  ELEVENLABS_KEY,
  TRANSLATE_KEY,
  TRANSLATIONS_KEY,
  SENT_KEY,
  RECENT_KEY,
  SYNC_KEY,
] as const

/**
 * Put the device back to what it shipped with.
 *
 * **The signed-in user stays.** Signing out is its own item with its own
 * confirmation, and dropping somebody at the sign-in page is not what they asked
 * for when they asked for their settings back.
 *
 * Storage only — nothing here can reach the React state holding the same values,
 * and a screen still showing phrases that no longer exist is worse than no reset
 * at all. The caller reloads, which is the one way to be sure every module has
 * read the empty shelf rather than most of them.
 */
export function factoryReset() {
  for (const key of RESETTABLE_KEYS) localStorage.removeItem(key)
}

/** What the app holds immediately after one, for anything that wants to assert it. */
export const factoryState = () => ({
  store: emptyStore(),
  aliases: EMPTY_ALIASES,
  settings: DEFAULT_SETTINGS,
})

// ── Arranging things ─────────────────────────────────────────────────────────
// Pure operations over the store above: what a category is called, and what
// order the tabs and the emergency bar come in.

/** The name a category is shown under, after any rename. */
export function displayCategory(source: string, renames: Record<string, string>): string {
  return renames[source] ?? source
}

/**
 * Rename every source category currently displayed as `from` so it shows as
 * `to`. Renaming onto an existing name merges the two, which is the only sane
 * reading of giving two categories the same name.
 */
export function renameCategory(store: PhraseStore, from: string, to: string): Partial<PhraseStore> {
  const renames = { ...store.categoryRenames }
  for (const [source, shown] of Object.entries(renames)) {
    if (shown === from) renames[source] = to
  }
  // A source that has never been renamed still displays under its own name.
  if (!(from in renames)) renames[from] = to
  // Identity entries carry no information.
  for (const [source, shown] of Object.entries(renames)) {
    if (source === shown) delete renames[source]
  }
  return {
    categoryRenames: renames,
    categories: [...new Set(store.categories.map(c => (c === from ? to : c)))],
    // A renamed category keeps the place its old name held; a merge collapses
    // onto the earlier of the two positions.
    categoryOrder: [...new Set(store.categoryOrder.map(c => (c === from ? to : c)))],
  }
}

/**
 * Arrange category names for display. An empty `order` means alphabetical;
 * otherwise the names it lists come first in that order and anything it has
 * never heard of follows, alphabetically.
 */
export function orderCategories(names: string[], order: string[]): string[] {
  if (order.length === 0) return [...names].sort()
  const rank = new Map(order.map((name, i) => [name, i]))
  const ranked = names.filter(n => rank.has(n)).sort((a, b) => rank.get(a)! - rank.get(b)!)
  const rest = names.filter(n => !rank.has(n)).sort()
  return [...ranked, ...rest]
}

/**
 * Arrange the emergency phrases. An empty `order` leaves them exactly as they
 * come, which is the order Peri ships them in — unlike the categories, whose
 * natural order is alphabetical. Ids the order has never heard of keep their
 * place at the end, so an emergency phrase added later lands after the ones
 * already arranged rather than somewhere in the middle of them.
 */
export function orderEmergency<T extends { id: string }>(phrases: T[], order: string[]): T[] {
  if (order.length === 0) return phrases
  const rank = new Map(order.map((id, i) => [id, i]))
  const ranked = phrases.filter(p => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const rest = phrases.filter(p => !rank.has(p.id))
  return [...ranked, ...rest]
}

/**
 * The full order after moving `from` to where `to` sits. Landing after the
 * target when moving rightwards and before it when moving leftwards is what
 * puts the thing being moved where the pointer actually is, either way.
 *
 * Serves the category tabs and the emergency bar alike: the first arranges
 * names, the second ids, and the arithmetic never cared which.
 */
export function moveInOrder(shown: string[], from: string, to: string): string[] {
  const fromIndex = shown.indexOf(from)
  const toIndex = shown.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || from === to) return shown
  const rest = shown.filter(c => c !== from)
  rest.splice(rest.indexOf(to) + (fromIndex < toIndex ? 1 : 0), 0, from)
  return rest
}
