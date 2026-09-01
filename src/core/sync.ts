// What travels between two devices signed in to the same account, and which way
// it should travel.
//
// **The payload is a backup.** Not a second format that has to be kept in step
// with the first — the very same document `buildBackup` writes and `applyBackup`
// reads, which is already a diff against the phrase table, already versioned,
// and already tested against every shape of damage. Sync is that document, put
// somewhere both devices can reach, with a lock on it.
//
// Three things are decided here and nowhere else:
//
//  * **The envelope**, which is what the server holds. Everything inside it is
//    encrypted except the two facts a device needs in order to decide whether to
//    bother reading it: when it was written and by which device. That is a real
//    disclosure — the server learns when somebody edits their board, though
//    never what they wrote — and it is the price of not having to decrypt a blob
//    to find out it was our own.
//  * **Which way to sync**, in `decideSync`. Pure, because it is the part with
//    the interesting mistakes in it.
//  * **What a conflict means.** The last change wins, whole. See `decideSync`.

import type { Backup } from './backup'
import { DEFAULT_SETTINGS, type ElevenLabsAccount, type Settings } from './store'

// The wire format lives on its own so the Netlify function can take it without
// taking the phrase table with it — see `envelope.ts`. Passed straight back out,
// so a caller reaching for either half only ever needs one import.
export {
  MAX_ENVELOPE_BYTES,
  SYNC_FORMAT,
  SYNC_VERSION,
  parseEnvelope,
  readAddress,
  readRevision,
  type Envelope,
} from './envelope'

/**
 * The date stamped on a backup built for sync, and it is deliberately not today.
 *
 * `buildBackup` records when it ran, which is right for a file somebody saves
 * and wrong here: a document that differs from the last one only in its
 * timestamp is a board that looks edited on every render, and a device that
 * thinks it has news pushes for ever. When a board was written down is the
 * snapshot's business — see `Snapshot.updatedAt`.
 */
export const SYNC_EPOCH = new Date(0)

/**
 * Everything that travels: the board, and the things a *backup* is not allowed
 * to carry.
 *
 * **The distinction is the whole point.** A backup is a file made to be handed
 * to somebody else, so the ElevenLabs key is kept out of one — a file with the
 * key in it hands over the account. A snapshot is sealed with the user's own
 * passphrase and goes to their own devices and nowhere else, which is a
 * different question with a different answer.
 *
 * So the account rides *beside* the backup rather than in it. Put it inside and
 * every exported file would carry it too, and that rule is written down in four
 * places and tested in one.
 */
export interface Snapshot {
  updatedAt: number
  device: string
  backup: Backup
  /**
   * The linked ElevenLabs account, or null for a device with none. Absent in a
   * snapshot written before this existed, which is why it is optional — and why
   * absent has to mean "says nothing" rather than "unlink", or the first device
   * to sync from an older release would take the account off the others.
   */
  account?: ElevenLabsAccount | null
}

/**
 * The settings that belong to a device rather than to a person.
 *
 * **Text size** is how big the words are on *this* screen: a phone held at
 * arm's length and a tablet on a wheelchair mount want different numbers, and
 * the person is the same person. **Volume** is the same question about a
 * speaker — a quiet handset and a loud tablet, one room and another.
 *
 * Everything else is a preference that follows somebody about: dwell times are
 * about their motor control, the voice is how they want to sound, and those
 * should be the same wherever they pick up a device.
 *
 * A *backup* still carries all of them. Restoring one is putting a device back
 * the way it was, usually the same device or its replacement — a different
 * question from keeping two devices that are in use at once alike.
 */
export const DEVICE_LOCAL_SETTINGS = ['zoom', 'volume'] as const

/**
 * The settings as they travel: this device's own text size and volume replaced
 * by the defaults, so that changing either is not a change to the board at all.
 *
 * Blanked on the way *out* as well as ignored on the way in, and the reason is
 * the round trip: left in, turning the text size up on the tablet would count as
 * news, push, and land on the phone as "Board updated from your other device" —
 * a notice about something that did not happen to the board.
 */
export function portableSettings(settings: Settings): Settings {
  const portable = { ...settings }
  for (const key of DEVICE_LOCAL_SETTINGS) portable[key] = DEFAULT_SETTINGS[key]
  return portable
}

/** Settings that arrived, with this device's own text size and volume kept. */
export function keepDeviceSettings(incoming: Settings, mine: Settings): Settings {
  const kept = { ...incoming }
  for (const key of DEVICE_LOCAL_SETTINGS) kept[key] = mine[key]
  return kept
}

/** What the app hands over to be sealed, and gets back when one arrives. */
export interface SyncPayload {
  backup: Backup
  account: ElevenLabsAccount | null
}

/** A snapshot, or null — the same guard, on the inside of the lock. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Record<string, unknown>
  if (typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt)) return null
  if (typeof s.device !== 'string') return null
  if (typeof s.backup !== 'object' || s.backup === null) return null

  const snapshot: Snapshot = { updatedAt: s.updatedAt, device: s.device, backup: s.backup as Backup }
  // Three states, not two: an account, no account, and nothing said. Only the
  // first two are instructions — see `Snapshot.account`.
  if (s.account === null) snapshot.account = null
  else if (isAccount(s.account)) snapshot.account = s.account
  return snapshot
}

/** Enough of an account to be worth taking: a key, and a list of voices. */
function isAccount(value: unknown): value is ElevenLabsAccount {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return typeof a.apiKey === 'string' && a.apiKey !== '' && Array.isArray(a.voices)
}

/**
 * This browser profile, as far as sync is concerned.
 *
 * Out of `getRandomValues` rather than `randomUUID`: the second is missing from
 * some of the environments this runs in, and this is called on the way in to
 * every load — a name that cannot be made is an app that will not start.
 */
export const newDeviceId = () =>
  [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * Whether this device has a board of its own, as opposed to the one Peri ships.
 *
 * Asked once, at the moment a device is joined to an account that has already
 * synchronized something. Both boards cannot be kept, and quietly choosing
 * either is a way to lose somebody's phrases — so a device with nothing of its
 * own takes what is there without a word, and a device with something asks.
 *
 * **Settings alone do not count as a board.** A dwell time set on this device is
 * a real preference, but the board arriving carries its own settings and those
 * are the same person's; phrases, categories and word lists are the things that
 * exist nowhere else.
 */
export function hasOwnBoard(backup: Backup): boolean {
  return (
    backup.added.length > 0 ||
    backup.edited.length > 0 ||
    backup.removed.length > 0 ||
    backup.categories.created.length > 0 ||
    Object.keys(backup.categories.renamed).length > 0 ||
    backup.categories.order.length > 0 ||
    (backup.emergencyOrder?.length ?? 0) > 0 ||
    Object.keys(backup.aliases?.lists ?? {}).length > 0 ||
    (backup.aliases?.hidden?.length ?? 0) > 0
  )
}

/** Where this device has got to. */
export interface LocalMark {
  /** When this device's board last changed. */
  updatedAt: number
  /** Whether that change has been sent. */
  dirty: boolean
}

/** Where the server has got to, or null when it holds nothing yet. */
export interface RemoteMark {
  updatedAt: number
  device: string
}

export type SyncAction = 'push' | 'pull' | 'idle'

/**
 * Which way, if either.
 *
 * **The last change wins, whole.** Not field by field: a board is a diff against
 * the phrase table, and half of one diff merged with half of another is a board
 * neither device ever had. Merging is what the *import* screen does, because a
 * file from somebody else must never delete a phrase — but between two of your
 * own devices a deletion has to travel, or the feature is a machine for
 * resurrecting phrases you have just thrown away.
 *
 * What that costs: edit on two devices without letting them meet in between, and
 * the earlier edit is gone. Pushes are prompt and the window is seconds, but the
 * cost is real and the guide says so plainly rather than pretending otherwise.
 *
 * The device is not consulted, on purpose. A second tab shares this device's id
 * and can still hold a newer board, so what decides is the clock and never the
 * name — the id is for telling somebody which device last wrote, and nothing.
 */
export function decideSync(local: LocalMark, remote: RemoteMark | null): SyncAction {
  // Nothing up there at all: this device is the first, whether or not it has
  // changed anything since. Without this, a board full of phrases would sit
  // unsynchronized until its owner happened to edit one.
  if (!remote) return 'push'
  if (remote.updatedAt > local.updatedAt) return 'pull'
  return local.dirty ? 'push' : 'idle'
}
