// Talking to the box on the server. Everything here is one HTTP call and a
// result somebody can act on.
//
// **Nothing throws.** Sync is the one part of Peri that is allowed to fail: a
// board works offline, on a train, on hotel wifi that resolves nothing, and a
// device that cannot reach the server has lost nothing at all — it has a board
// in front of it and a change it will send later. So a failure is a value, and
// the caller's worst case is a line of text under a setting.

import { MAX_ENVELOPE_BYTES, parseEnvelope, type Envelope } from '../core/sync'

const ENDPOINT = '/api/sync'

/** What is at an address: an envelope and the revision it was written as. */
export interface Slot {
  envelope: Envelope | null
  revision: number
}

export type PullResult = { status: 'ok'; slot: Slot } | { status: 'error'; error: string }

export type PushResult =
  | { status: 'ok'; revision: number }
  /** Somebody wrote first. What they wrote comes back with the refusal. */
  | { status: 'stale'; slot: Slot }
  | { status: 'error'; error: string }

/** A slot out of whatever the server said, or null if it said something else. */
function readSlot(body: unknown): Slot | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (typeof b.revision !== 'number') return null
  // A slot with nothing in it is a real answer: it is what every account looks
  // like until the first device pushes.
  const envelope = b.envelope == null ? null : parseEnvelope(b.envelope)
  if (b.envelope != null && !envelope) return null
  return { envelope, revision: b.revision }
}

const offline = 'Could not reach the server'

export async function pull(address: string): Promise<PullResult> {
  try {
    const res = await fetch(`${ENDPOINT}?a=${address}`, { cache: 'no-store' })
    if (!res.ok) return { status: 'error', error: `Server said ${res.status}` }
    const slot = readSlot(await res.json())
    return slot ? { status: 'ok', slot } : { status: 'error', error: 'Unreadable answer' }
  } catch {
    return { status: 'error', error: offline }
  }
}

export async function push(address: string, envelope: Envelope, revision: number): Promise<PushResult> {
  const body = JSON.stringify({ address, envelope, revision })
  // Checked here as well as on the server, so a board too large to send says so
  // in the settings panel rather than as a 413 nobody sees.
  if (body.length > MAX_ENVELOPE_BYTES) return { status: 'error', error: 'This board is too large to synchronize' }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (res.status === 409) {
      const slot = readSlot(await res.json())
      return slot ? { status: 'stale', slot } : { status: 'error', error: 'Unreadable answer' }
    }
    if (!res.ok) return { status: 'error', error: `Server said ${res.status}` }
    const answer = (await res.json()) as { revision?: unknown }
    return typeof answer.revision === 'number'
      ? { status: 'ok', revision: answer.revision }
      : { status: 'error', error: 'Unreadable answer' }
  } catch {
    return { status: 'error', error: offline }
  }
}

/**
 * Take the board off the server.
 *
 * What "stop synchronizing" means for the copy already up there. Turning the
 * setting off on one device leaves the others syncing to each other, so this is
 * offered separately and only where somebody asks for it — see the settings row.
 */
export async function drop(address: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}?a=${address}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}
