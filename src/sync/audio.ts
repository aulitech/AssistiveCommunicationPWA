// Audio on the server, one clip at a time.
//
// An ElevenLabs clip is billed per character, and the same phrase said on a
// tablet and on a phone used to be bought twice. It need not be: a clip is
// decided entirely by the voice and the words, so two devices on one account
// want the identical bytes and either of them can pay for both.
//
// **This is not part of the board, and that is the design.** The board is one
// blob, written whole on every change; audio is bought by *speaking* rather than
// by editing, so folding clips into it would make saying a phrase look like an
// edit — a push, on every device, for something nobody changed. So each clip is
// its own blob at its own address, and the board never grows by a byte.
//
// **Nothing here is looked up.** A clip's address is derived from the cache key,
// which is the voice and the words — so a second device works the address out
// for itself from the phrase already on its board. There is no listing to fetch
// before a clip can be found, and the server is handed a different 256-bit
// number for every clip and can tell nothing from any of them.
//
// **What is listed is what has been uploaded**, in one more blob beside them.
// That exists for a single purpose: *Take the board off the server* has to be
// able to take the audio too, and an address nobody wrote down is an address
// nobody can delete. So the index is written **before** the clip it names, and
// the invariant is one-directional on purpose — the index may name a clip that
// is not there, which costs a wasted DELETE, and a clip is never there without
// the index naming it, which would be somebody's words left behind after they
// asked for them back.
//
// Like everything else under `sync/`, nothing throws and every failure is a
// value. A clip that cannot be sent or fetched is a clip bought again, which is
// a cost rather than a fault — the phrase is still spoken either way.

import { base64ToBytes, bytesToBase64, open, seal, type SyncKeys } from '../core/crypto'
import { SYNC_FORMAT, SYNC_VERSION, type Envelope } from '../core/sync'
import { drop, pull, push } from './client'

/**
 * How large a clip may be before it stays at home.
 *
 * The envelope cap is a megabyte, and a clip grows on its way into one: base64
 * to make it JSON, then the ciphertext base64 again, which is about eight
 * fifths in total before the envelope's own fields. This leaves room for that.
 * It is around half a minute of speech, and a board phrase is a sentence.
 */
export const MAX_CLIP_BYTES = 500_000

/** How many times to lose a race for the index before leaving it. */
const INDEX_TRIES = 2

/** A clip as it travels: the bytes as text, and what kind of audio they are. */
interface TravellingClip {
  type: string
  data: string
}

async function envelopeFor(keys: SyncKeys, device: string, value: unknown): Promise<Envelope> {
  return {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    updatedAt: Date.now(),
    device,
    ...(await seal(keys.key, value)),
  }
}

/** A clip out of what was sealed, or null for anything that is not one. */
function readClip(value: unknown): Blob | null {
  if (typeof value !== 'object' || value === null) return null
  const clip = value as Record<string, unknown>
  if (typeof clip.type !== 'string' || typeof clip.data !== 'string') return null
  try {
    return new Blob([base64ToBytes(clip.data)], { type: clip.type })
  } catch {
    // Damaged base64. The caller buys the clip again, which is the whole cost.
    return null
  }
}

/**
 * The uploaded keys out of what was sealed. Anything else reads as none.
 *
 * **The filter cannot change what happens today**, and it is here anyway: only
 * this user's own devices can write this blob, so nothing but strings ever
 * reaches it, and a stray number would derive its own harmless address and be
 * deleted from nowhere. What it buys is that the `string[]` is true, which is
 * what lets `noteClip` and `forgetClips` treat every entry as one without a
 * cast between them.
 */
function readIndex(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []
}

/**
 * The clip another device already paid for, or null.
 *
 * Null for nothing there, for a server that cannot be reached, and for a blob
 * that will not open — all three mean the same thing to the caller, which is
 * that this clip has to be bought.
 */
export async function getClip(keys: SyncKeys, cacheKey: string): Promise<Blob | null> {
  try {
    const address = await keys.clipAddress(cacheKey)
    const result = await pull(address)
    if (result.status !== 'ok' || !result.slot.envelope) return null
    return readClip(await open(keys.key, result.slot.envelope))
  } catch {
    // The derivation is the only thing here that can throw, and it must cost a
    // clip rather than the voice: this sits in front of ElevenLabs, and a
    // rejection would drop the phrase all the way back to the device.
    return null
  }
}

/**
 * Writes the key into the index, and says whether the clip may follow it up.
 *
 * False is the answer for a server that cannot be reached and for an index that
 * has grown past what may be sent — and in both cases the clip stays at home,
 * because a clip the index does not name is one that could never be deleted.
 */
async function noteClip(keys: SyncKeys, device: string, cacheKey: string): Promise<boolean> {
  for (let tries = INDEX_TRIES; tries > 0; tries--) {
    const result = await pull(keys.clipIndexAddress)
    if (result.status !== 'ok') return false

    const listed = result.slot.envelope ? readIndex(await open(keys.key, result.slot.envelope)) : []
    // Already up, put there by this device or another. Nothing to write, and
    // nothing to pay — the caller finds it at its address next time.
    if (listed.includes(cacheKey)) return true

    const envelope = await envelopeFor(keys, device, [...listed, cacheKey])
    const written = await push(keys.clipIndexAddress, envelope, result.slot.revision)
    if (written.status === 'ok') return true
    if (written.status === 'error') return false
    // Stale: another device wrote a clip in the same moment. Read what it put
    // there and add to that rather than over it.
  }
  return false
}

/**
 * Offers a clip to the user's other devices.
 *
 * The index first and the clip second, so the server never holds a clip nothing
 * knows the address of. A clip too large to send simply stays here.
 */
export async function putClip(keys: SyncKeys, device: string, cacheKey: string, blob: Blob): Promise<void> {
  if (blob.size > MAX_CLIP_BYTES) return
  try {
    if (!(await noteClip(keys, device, cacheKey))) return

    const address = await keys.clipAddress(cacheKey)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const envelope = await envelopeFor(keys, device, {
      type: blob.type,
      data: bytesToBase64(bytes),
    } as TravellingClip)
    // A clip never changes, so it is only ever written once. A refusal here
    // means another device wrote the same bytes first, which is the outcome
    // anyway.
    await push(address, envelope, 0)
  } catch {
    // Nothing is owed here. The clip is in hand and already being spoken, and
    // failing to offer it costs another device one purchase.
  }
}

/**
 * Takes every clip off the server, and then the list of them.
 *
 * What *Take the board off the server* has to do about audio.
 *
 * **The list goes only if every clip went**, which is the other half of writing
 * it first. `drop` answers with a value rather than throwing, so a refused
 * DELETE would otherwise be walked straight past and the list taken away over
 * the top of it — leaving somebody's words at an address nothing now names,
 * after they had asked for them back. What is left instead is a list that still
 * names them, so running this again finishes the job.
 */
export async function forgetClips(keys: SyncKeys): Promise<void> {
  try {
    const result = await pull(keys.clipIndexAddress)
    if (result.status !== 'ok' || !result.slot.envelope) return

    let allGone = true
    for (const cacheKey of readIndex(await open(keys.key, result.slot.envelope))) {
      if (!(await drop(await keys.clipAddress(cacheKey)))) allGone = false
    }
    if (allGone) await drop(keys.clipIndexAddress)
  } catch {
    // Whatever is left is still named by the list, and running this again
    // finishes the job.
  }
}

/**
 * The two calls the audio cache wants, bound to this device's keys.
 *
 * Shaped to `RemoteClips` in `voice/audio-cache.ts` without either module
 * importing the other — they sit on the same line of the layering, so neither
 * may. What puts the two together is the screen that holds both.
 */
export interface ClipStore {
  get: (cacheKey: string) => Promise<Blob | null>
  put: (cacheKey: string, blob: Blob) => void
}

export function clipStore(keys: SyncKeys, device: string): ClipStore {
  return {
    get: cacheKey => getClip(keys, cacheKey),
    // Never waited on: this is somebody mid-sentence, and the clip they are
    // about to hear is already in hand.
    put: (cacheKey, blob) => void putClip(keys, device, cacheKey, blob),
  }
}
