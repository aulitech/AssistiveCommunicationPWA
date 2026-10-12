// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { base64ToBytes, bytesToBase64 } from '../crypto'
import { PRESENTATION_BACKGROUND_AT, PRESENTATION_BACKGROUND_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── The picture behind the presentation window ────────────────────────────────
// **Not a setting**: settings ride inside the board, into every backup and every
// snapshot, and a picture is hundreds of times the size of everything else in
// them put together. So it is kept here under a name of its own, as an image
// already made small enough to keep — see `menu/picture.ts`, which makes it so.
//
// **It goes to the user's other devices, and into no backup.** Not inside the
// board: the board carries only which picture and when it was chosen (the
// record below), and the picture itself goes up once, as a locked file of its
// own beside the audio clips — see `sync/picture.ts`. A board sent on every edit
// with a picture in it would send the picture on every edit.

/** The picture as a `data:` URL, or empty for none. */
export function loadPresentationBackground(): string {
  try {
    const raw = localStorage.getItem(storageKey(PRESENTATION_BACKGROUND_KEY))
    return raw?.startsWith('data:image/') ? raw : ''
  } catch {
    return ''
  }
}

/** Keeps the picture, or takes it away for empty — and says whether it was kept. */
export function savePresentationBackground(url: string): boolean {
  if (!url) {
    localStorage.removeItem(storageKey(PRESENTATION_BACKGROUND_KEY))
    return true
  }
  return writeKey(storageKey(PRESENTATION_BACKGROUND_KEY), url)
}

/** Whether a change to storage was to the picture — the presentation window follows it live. */
export const isPresentationBackground = (key: string | null) => key === storageKey(PRESENTATION_BACKGROUND_KEY)

/**
 * **Which picture this device should have, and what it owes the server.** The
 * first two travel in the board, and the newer of two devices' stands — the
 * rule the keys follow, see `replyKeyFrom` in `core/sync.ts`. The last two never
 * leave the device.
 */
export interface PictureRecord {
  /** Which picture, as `pictureId` names it — or empty for none. */
  id: string
  /** When it was chosen or taken away, or 0 for never. */
  at: number
  /** Whether it is on the server already, or has still to go up from here. */
  sent: boolean
  /** Pictures this device put up, or was told of, that have been replaced since — to be taken off the server. */
  gone: string[]
}

export const NO_PICTURE: PictureRecord = { id: '', at: 0, sent: true, gone: [] }

export function loadPictureRecord(): PictureRecord {
  try {
    const raw = localStorage.getItem(storageKey(PRESENTATION_BACKGROUND_AT))
    if (!raw) return NO_PICTURE
    const r = JSON.parse(raw) as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.at !== 'number' || !Number.isFinite(r.at)) return NO_PICTURE
    return {
      id: r.id,
      at: r.at,
      sent: r.sent !== false,
      gone: Array.isArray(r.gone) ? r.gone.filter((g): g is string => typeof g === 'string') : [],
    }
  } catch {
    return NO_PICTURE
  }
}

export function savePictureRecord(record: PictureRecord): boolean {
  return writeKey(storageKey(PRESENTATION_BACKGROUND_AT), JSON.stringify(record))
}

/**
 * Where a picture is kept on the server, among the audio clips — when it was
 * chosen as well as which, so a picture taken off the server as replaced can
 * never be one somebody has since chosen again.
 */
export const pictureClip = (record: Pick<PictureRecord, 'id' | 'at'>) => `picture ${record.at} ${record.id}`

/**
 * The record once something else stands: what this device had goes onto the
 * list to take off the server — if it was ever there to take.
 */
export const replacing = (
  mine: PictureRecord,
  next: Pick<PictureRecord, 'id' | 'at' | 'sent'>,
): PictureRecord => ({
  ...next,
  gone: mine.id && mine.sent ? [...mine.gone, pictureClip(mine)] : mine.gone,
})

/** The picture's bytes and what kind of picture they are, out of its `data:` URL. */
export function pictureBytes(url: string): { type: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
  if (!match) return { type: '', bytes: new Uint8Array() }
  return { type: match[1], bytes: base64ToBytes(match[2]) }
}

/** A `data:` URL out of a picture's bytes. */
export const pictureUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${bytesToBase64(bytes)}`

/**
 * A name for a picture worked out from its bytes, so a picture that arrives can
 * be checked to be the one the board names before it is shown.
 */
export async function pictureId(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', pictureBytes(url).bytes as BufferSource)
  return [...new Uint8Array(digest).slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')
}
