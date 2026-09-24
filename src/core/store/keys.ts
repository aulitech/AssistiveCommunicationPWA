// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { reportFailure } from '../report'

// Four of these storage keys still say `dwellspeak_`, the app's former name.
// They are deliberately not renamed: everything a user has — their phrases,
// their edits, their dwell times — lives under these keys and nowhere else, and
// renaming them without a migration would silently empty the app for everyone
// already using it. The name is cosmetic; the data is not.
//
// Each is somebody's, and is read and written through `storageKey`, which puts
// whose after the name — see *Whose board*. `USER_KEY` is the one exception.
export const SETTINGS_KEY = 'dwellspeak_settings'
export const PHRASE_STORE_KEY = 'dwellspeak_phrase_store_v2'
export const PROFILE_KEY = 'dwellspeak_profile' // read once, to carry an old profile forward
export const ALIASES_KEY = 'peri_aliases'
export const ALIAS_SORT_KEY = 'peri_alias_sort'
export const USER_KEY = 'dwellspeak_user'
export const ELEVENLABS_KEY = 'peri_elevenlabs'
export const REPLY_KEY = 'peri_reply'
export const REPLY_CONTEXT_KEY = 'peri_reply_context'
export const ANSWERS_KEY = 'peri_answers'
export const APOLOGIES_KEY = 'peri_apologies'
export const TRANSLATIONS_KEY = 'peri_translations'
export const SENT_KEY = 'peri_sent'
export const TRANSLATED_KEY = 'peri_translated'
export const RECENT_KEY = 'peri_recent'
export const USAGE_KEY = 'peri_usage'
export const PHRASE_SORT_KEY = 'peri_phrase_sort'
export const SYNC_KEY = 'peri_sync'

/**
 * Everything this app has ever written down, except who is signed in and who
 * owned the board first — which is to say every piece of somebody's board.
 *
 * Listed rather than reached for with `localStorage.clear()`: this app is served
 * from an origin that may hold something it did not put there, and a reset is no
 * licence to remove somebody else's key. The list is right here beside the
 * constants it names, so a new key added above and forgotten here is a key a
 * reset leaves behind — which is the failure to watch for.
 */
export const RESETTABLE_KEYS = [
  SETTINGS_KEY,
  PHRASE_STORE_KEY,
  PROFILE_KEY,
  ALIASES_KEY,
  ALIAS_SORT_KEY,
  ELEVENLABS_KEY,
  REPLY_KEY,
  REPLY_CONTEXT_KEY,
  ANSWERS_KEY,
  APOLOGIES_KEY,
  TRANSLATIONS_KEY,
  SENT_KEY,
  TRANSLATED_KEY,
  RECENT_KEY,
  USAGE_KEY,
  PHRASE_SORT_KEY,
  SYNC_KEY,
] as const

// ── Writing it down ───────────────────────────────────────────────────────────
// **Every write to storage goes through `writeKey`**, and `tests/app/
// structure.test.ts` holds the tree to it.
//
// A write can be refused, and on the devices this app is for that is not
// hypothetical: every account on a device keeps its own board in one origin's
// few megabytes, a private window may refuse storage outright, and a browser
// short of space refuses rather than making room. A refused write used to throw
// — out of a React state update, more often than not — and take the whole
// screen with it: a blank page, the emergency bar included, on a device that
// may be the only way its owner has of saying anything.
//
// So nothing throws. The board goes on working from memory, the failure is
// reported, and every listener is told — so the screen can say plainly that
// what is changed now is not being kept, and offer a backup while there is
// still something in memory to back up.

const writeFailureListeners = new Set<() => void>()

/** Told whenever a write is refused. Returns the unsubscribe. */
export function onWriteFailure(listener: () => void): () => void {
  writeFailureListeners.add(listener)
  return () => {
    writeFailureListeners.delete(listener)
  }
}

/**
 * Keep a value, and say whether it was kept.
 *
 * What is reported is which record — the name before whose it is — and never
 * what was in it, nor whose: a console ends up in screenshots.
 */
export function writeKey(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    reportFailure('store/write', `Could not save ${key.split('@')[0]}`)
    for (const listener of [...writeFailureListeners]) listener()
    return false
  }
}
