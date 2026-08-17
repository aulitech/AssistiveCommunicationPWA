// Everything Peri keeps between sessions, and the shapes it keeps it in.
//
// Split out of App.tsx so `src/backup.ts` can be written against the same
// definitions the app itself runs on. A second copy of these shapes would drift
// the first time one of them changed, and an export that no longer matches the
// store is a backup that silently restores nothing.

import { EMPTY_PROFILE, type Profile } from './phrases'

// Four of these storage keys still say `dwellspeak_`, the app's former name.
// They are deliberately not renamed: everything a user has — their phrases,
// their edits, their dwell times — lives under these keys and nowhere else, and
// renaming them without a migration would silently empty the app for everyone
// already using it. The name is cosmetic; the data is not.
const SETTINGS_KEY = 'dwellspeak_settings'
const PHRASE_STORE_KEY = 'dwellspeak_phrase_store_v2'
const PROFILE_KEY = 'dwellspeak_profile'
const USER_KEY = 'dwellspeak_user'
const ELEVENLABS_KEY = 'peri_elevenlabs'
const SENT_KEY = 'peri_sent'
const RECENT_KEY = 'peri_recent'

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
  voiceURI: string // empty = default
  volume: number // 0–1
  rate: number // 0.5–2
  /** Speak each selected phrase immediately instead of composing a message. */
  autoSpeak: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  phraseDwellMs: 1500,
  actionDwellMs: 800,
  repeatDelayMs: 200,
  voiceURI: '',
  volume: 1,
  rate: 1,
  autoSpeak: false,
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
  repeatDelayMs: { min: 100, max: 1000 },
  volume: { min: 0, max: 1 },
  rate: { min: 0.5, max: 2 },
} as const

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
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

// ── Profile ──────────────────────────────────────────────────────────────────
// Fills the `contacts` and `name` aliases the phrase table ships empty, so
// phrases like "I'm going to call {contact}" have something to offer.

export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}')
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    return {
      name: {
        given: str(raw?.name?.given),
        surname: str(raw?.name?.surname),
        nickname: str(raw?.name?.nickname),
      },
      contacts: Array.isArray(raw?.contacts) ? raw.contacts.filter((c: unknown) => typeof c === 'string') : [],
    }
  } catch {
    return EMPTY_PROFILE
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
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

// ── Who is signed in ─────────────────────────────────────────────────────────
// Deliberately not part of a backup: a file that could sign you in as someone
// else is a file that could sign someone else in as you.

export interface User {
  name: string
  email: string
  provider: 'google' | 'apple' | 'facebook' | 'guest'
  avatar?: string
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
