// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { SETTINGS_KEY, writeKey } from './keys'
import { NOBODY, storageKey } from './owner'

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
  /**
   * language → the voice chosen while the board was speaking it.
   *
   * **A voice is a language**, so switching the board between two of them used
   * to throw the old voice away and let the browser pick. That made the setting
   * a thing to redo every time rather than a thing to set: somebody working in
   * two languages was choosing a voice twice a day. This remembers, and
   * `voiceURI` becomes the voice for whichever language is on.
   *
   * `''` is a key like any other — the board following the device is a setting
   * somebody chose a voice under too.
   */
  voicesByLanguage: Record<string, string>
  volume: number // 0–1
  rate: number // 0.5–2
  /** Speak each selected phrase immediately instead of composing a message. */
  autoSpeak: boolean
  /**
   * Whether Peri offers its own keyboard — the toggle beside the menu, and the
   * four rows it opens.
   *
   * **Off until somebody asks for it.** It is the only way to type at all on
   * iOS, where a dwell raises no system keyboard, and it is a control in the
   * way on a device that has a real one. A board is somebody's own screen, and
   * a control they will never use is a target their gaze passes over on the way
   * to the ones they do.
   *
   * **It does not travel**, for the reason the text size does not: which
   * keyboard a device can raise is about the device in front of somebody, and
   * the same person's tablet and laptop do not answer the same way.
   */
  keyboard: boolean
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
  /**
   * Which model writes a suggested reply — see `listen/suggest.ts`.
   *
   * A closed list rather than a free string, and `readReplyModel` is what holds
   * it to one. A model name is handed to somebody else's API, and a board
   * restored from a file naming one this build has never heard of should fall
   * back to something that works rather than fail on the first question
   * somebody is asked.
   */
  replyModel: string
}

/**
 * The models a suggested reply may be written by.
 *
 * **The first three are ordered by how long they take**, which is the axis that
 * matters most here: this is somebody mid-conversation with a person waiting in
 * front of them. The default is the quickest for that reason, the same reason
 * the ElevenLabs voice is Flash — a better sentence that arrives ten seconds
 * later is not a better sentence.
 *
 * The fourth is not on that axis at all, which is why it is last rather than
 * slotted among them: it is a different voice rather than a faster or a slower
 * one, and somebody who wants their board to sound less like a form is choosing
 * something other than speed.
 *
 * Here rather than beside the service that calls them, because this is where
 * the setting is validated and `core/` cannot reach `listen/`.
 *
 * **`thinks` marks a model that always thinks before it answers** and cannot
 * be asked not to. What it costs is paid out of the same `max_tokens` as the
 * answers, so `listen/suggest.ts` gives those models room and asks them to
 * think as little as they will — see `MAX_TOKENS_THINKING` there.
 */
export const REPLY_MODELS: { id: string; name: string; detail: string; thinks?: boolean }[] = [
  { id: 'claude-haiku-4-5-20251001', name: 'Quickest', detail: 'Haiku 4.5. Answers in about a second' },
  {
    id: 'claude-sonnet-5',
    name: 'Better',
    detail: 'Sonnet 5. A little slower, and reads a question more closely',
  },
  {
    id: 'claude-opus-5-5',
    name: 'Best',
    detail: 'Opus 5.5. The slowest, for questions that need thinking about',
    thinks: true,
  },
  {
    id: 'claude-fable-5-1',
    name: 'Warmest',
    detail: 'Fable 5.1. Writes more like a person and less like a form',
    thinks: true,
  },
]

export const DEFAULT_REPLY_MODEL = REPLY_MODELS[0].id

/**
 * Models this build used to offer, and the one each is read as now.
 *
 * **Moved up, never down.** Anything this build does not know falls back to
 * the default, which is the quickest — so without this, somebody who had
 * chosen Opus would be moved to Haiku the day Opus moved on, silently, and so
 * would every backup and every synchronized board naming it. Whatever this
 * hands back is still checked against the list below, so a name out of a file
 * can only ever land on a model this build offers.
 */
const SUCCEEDED_BY = new Map([['claude-opus-5', 'claude-opus-5-5']])

/** A model this build knows, or the default. Asked of storage and of a file alike. */
export const readReplyModel = (raw: unknown): string => {
  const id = typeof raw === 'string' ? (SUCCEEDED_BY.get(raw) ?? raw) : raw
  return REPLY_MODELS.find(m => m.id === id)?.id ?? DEFAULT_REPLY_MODEL
}

/** Whether a model always thinks before answering — see `REPLY_MODELS`. */
export const replyModelThinks = (id: string): boolean => REPLY_MODELS.find(m => m.id === id)?.thinks === true

/** What a model is called, for a control that has to say which one is on. */
export const replyModelName = (id: string): string =>
  REPLY_MODELS.find(m => m.id === id)?.name ?? replyModelName(DEFAULT_REPLY_MODEL)

export const DEFAULT_SETTINGS: Settings = {
  phraseDwellMs: 1500,
  actionDwellMs: 800,
  repeatDelayMs: 1000,
  language: '',
  voiceURI: '',
  voicesByLanguage: {},
  volume: 1,
  rate: 1,
  // On, so the board talks the moment it is opened. Somebody who wants to build
  // a sentence out of several phrases turns it off; somebody who wants a button
  // to say a thing has nothing to find first.
  autoSpeak: true,
  keyboard: false,
  zoom: 1,
  replyModel: DEFAULT_REPLY_MODEL,
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
    const raw = JSON.parse(localStorage.getItem(storageKey(SETTINGS_KEY)) ?? '{}')
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      autoSpeak: DEFAULT_SETTINGS.autoSpeak,
      // Shape-checked rather than spread, because everything else here is read
      // with `?? default` at the point of use and this one is iterated. A
      // damaged value would throw where a missing one merely answers nothing.
      voicesByLanguage:
        raw?.voicesByLanguage && typeof raw.voicesByLanguage === 'object'
          ? (raw.voicesByLanguage as Record<string, string>)
          : DEFAULT_SETTINGS.voicesByLanguage,
      // Held to the list rather than spread, for the reason above and one more:
      // this one is handed to somebody else's API, and a board that had been
      // opened in a later release naming a model this build never heard of
      // would fail on the first question somebody was asked.
      replyModel: readReplyModel(raw?.replyModel),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  writeKey(storageKey(SETTINGS_KEY), JSON.stringify(s))
}

/** Enough of a voice to say what language it is in. */
export interface VoiceLanguage {
  voiceURI: string
  lang: string
}

/**
 * Choosing a voice, which is also choosing it **for the language on now**.
 *
 * Both halves are written together rather than the map being caught up later,
 * so there is no window in which the two disagree — and `voiceURI` stays the
 * one thing everything downstream reads, which is what keeps this change out
 * of `speak` entirely.
 */
export function chooseVoice(settings: Settings, voiceURI: string): Partial<Settings> {
  const voicesByLanguage = { ...settings.voicesByLanguage }
  // Going back to the default is a choice too, and remembering an empty string
  // is not the way to record it — an absent key already means "no voice of its
  // own", and a stored empty one would only be a thing to guard against later.
  if (voiceURI) voicesByLanguage[settings.language] = voiceURI
  else delete voicesByLanguage[settings.language]
  return { voiceURI, voicesByLanguage }
}

/**
 * Switching the board to another language, and to the voice it was last spoken
 * in.
 *
 * **The outgoing voice is written down on the way out**, not only when it was
 * picked. A device restored from a backup written before any of this existed
 * has a `voiceURI` and an empty map, and without this the first switch away
 * would throw that voice away — the exact loss the feature exists to stop.
 *
 * Where the new language has no voice remembered, the old rule still applies: a
 * device voice that does not match is let go of, and the browser picks one in
 * the chosen language. An ElevenLabs voice is left alone, having no language of
 * its own and speaking whatever it is given.
 */
export function chooseLanguage(settings: Settings, tag: string, voices: VoiceLanguage[]): Partial<Settings> {
  const voicesByLanguage = { ...settings.voicesByLanguage }
  if (settings.voiceURI) voicesByLanguage[settings.language] = settings.voiceURI

  const remembered = voicesByLanguage[tag]
  if (remembered) return { language: tag, voiceURI: remembered, voicesByLanguage }

  const voice = voices.find(v => v.voiceURI === settings.voiceURI)
  const mismatched = Boolean(tag && voice && voice.lang !== tag)
  return { language: tag, voicesByLanguage, ...(mismatched ? { voiceURI: '' } : {}) }
}

// ── Carried to the sign-in page ──────────────────────────────────────────────
// Signed out is nobody's board — see `owner.ts` — and it keeps one thing, the
// sign-in page's settings, carried both ways. Here rather than beside the
// owner because it is about settings, and the owner is what settings are read
// through: the other way round, the two would import each other.

/**
 * What the sign-in page needs of somebody's settings to be worked at all: how
 * long a dwell takes, and how big the text is.
 */
const reaching = ({ zoom, phraseDwellMs, actionDwellMs, repeatDelayMs }: Settings) => ({
  zoom,
  phraseDwellMs,
  actionDwellMs,
  repeatDelayMs,
})

/**
 * Leave the sign-in page worked the way this person worked their board — and
 * none of the rest of it. Whoever is at it next is most often the one who just
 * left, and somebody who needs a slow dwell cannot sign back in at a quick one.
 */
export function leaveForSignIn(settings: Settings) {
  writeKey(SETTINGS_KEY + NOBODY, JSON.stringify({ ...DEFAULT_SETTINGS, ...reaching(settings) }))
}

/**
 * The settings a board arrives with at sign-in: its own, or — opened on this
 * device for the first time — the dwell times and text size somebody just
 * signed in with, written down as its own. Needing a slow dwell to reach the
 * board is needing one on it.
 */
export function settingsOnArrival(signedOut: Settings): Settings {
  if (localStorage.getItem(storageKey(SETTINGS_KEY)) !== null) return loadSettings()
  const start = { ...DEFAULT_SETTINGS, ...reaching(signedOut) }
  saveSettings(start)
  return start
}
