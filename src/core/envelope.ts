// The wire format: what a synchronized board looks like on its way through the
// server, and how each end checks it.
//
// **This module imports nothing, and that is load-bearing.** The Netlify
// function takes this and nothing else out of `src`, so both ends validate
// identically rather than restating each other.
//
// It was all one module with the rest of sync until a single value imported from
// the store pulled `core/store` into the function, which pulled `core/phrases`,
// which pulled the two and a half thousand phrases Peri ships: a 3KB Lambda
// became 418KB of phrase table it has no use for. `tests/app/structure.test.ts`
// holds the rule now.

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
