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

export const SYNC_FORMAT = 'peri-sync'
export const SYNC_VERSION = 1

/**
 * How large an envelope may be, encrypted and encoded.
 *
 * The server is an open store — anything that knows an address may write to it —
 * so the size limit is the only thing between it and being used as somebody's
 * free disk. A board of a thousand phrases somebody wrote themselves is around a
 * tenth of this.
 */
export const MAX_ENVELOPE_BYTES = 1_000_000

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

/** What is inside the ciphertext: a whole board, and when it was that board. */
export interface Snapshot {
  updatedAt: number
  device: string
  backup: Backup
}

/** What sits on the server. */
export interface Envelope {
  format: typeof SYNC_FORMAT
  version: number
  /** Plaintext, so a device can decide whether to pull without holding the key. */
  updatedAt: number
  /** Plaintext, and only ever compared — never shown, never trusted. */
  device: string
  iv: string
  data: string
}

/**
 * An envelope, or null for anything that is not one.
 *
 * Used on both sides: the device will not decrypt what it cannot recognise, and
 * the server will not store it. The server has the stronger reason — it accepts
 * writes from anybody who knows an address, so "is this even the right shape" is
 * the whole of what it can check.
 */
export function parseEnvelope(value: unknown): Envelope | null {
  if (typeof value !== 'object' || value === null) return null
  const e = value as Record<string, unknown>
  if (e.format !== SYNC_FORMAT) return null
  if (typeof e.version !== 'number' || e.version > SYNC_VERSION) return null
  if (typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt)) return null
  if (typeof e.device !== 'string' || e.device.length > 64) return null
  if (typeof e.iv !== 'string' || typeof e.data !== 'string') return null
  return {
    format: SYNC_FORMAT,
    version: e.version,
    updatedAt: e.updatedAt,
    device: e.device,
    iv: e.iv,
    data: e.data,
  }
}

/** A snapshot, or null — the same guard, on the inside of the lock. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const s = value as Record<string, unknown>
  if (typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt)) return null
  if (typeof s.device !== 'string') return null
  if (typeof s.backup !== 'object' || s.backup === null) return null
  return { updatedAt: s.updatedAt, device: s.device, backup: s.backup as Backup }
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

/**
 * A valid address, or null.
 *
 * Exactly 64 lowercase hex characters — the whole of what the derivation
 * produces and nothing else. Used on the server, which has this and the shape of
 * an envelope and nothing else to go on, and on the way out of a device, so a
 * malformed address is caught before it becomes a request.
 */
export function readAddress(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null
}

/** A revision a device claims to have seen. Absent means "I have seen nothing". */
export function readRevision(value: unknown): number | null {
  if (value === undefined || value === null) return 0
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
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
