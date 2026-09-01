// Talking to the box on the server. Everything here is one HTTP call and a
// result somebody can act on.
//
// **Nothing throws.** Sync is the one part of Peri that is allowed to fail: a
// board works offline, on a train, on hotel wifi that resolves nothing, and a
// device that cannot reach the server has lost nothing at all — it has a board
// in front of it and a change it will send later. So a failure is a value, and
// the caller's worst case is a line of text under a setting.

import { MAX_ENVELOPE_BYTES, parseEnvelope, type Envelope } from '../core/sync'
import { reportFailure } from '../core/report'

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
const missing = 'Synchronizing is not available on this server'

/** The failure as a value, and the same failure in the console. */
function fail(where: string, error: string): { status: 'error'; error: string } {
  reportFailure(`sync/${where}`, error)
  return { status: 'error', error }
}

/**
 * The answer, or null when it is not JSON at all.
 *
 * A missing function is not a 404 here. The app's own catch-all rewrites
 * anything that is not a file on disk to `index.html`, so a sync endpoint that
 * was never deployed answers **200 with the app in it** — and a client that
 * checks `res.ok` sees success and then throws on the first `{` it does not
 * find. That happened, so it is checked rather than assumed.
 */
async function readJson(res: Response): Promise<unknown | null> {
  if (!res.headers.get('content-type')?.includes('json')) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function pull(address: string): Promise<PullResult> {
  try {
    const res = await fetch(`${ENDPOINT}?a=${address}`, { cache: 'no-store' })
    if (!res.ok) return fail('pull', `Server said ${res.status}`)
    const body = await readJson(res)
    if (body === null) return fail('pull', missing)
    const slot = readSlot(body)
    return slot ? { status: 'ok', slot } : fail('pull', 'Unreadable answer')
  } catch {
    return fail('pull', offline)
  }
}

export async function push(address: string, envelope: Envelope, revision: number): Promise<PushResult> {
  const body = JSON.stringify({ address, envelope, revision })
  // Checked here as well as on the server, so a board too large to send says so
  // in the settings panel rather than as a 413 nobody sees.
  if (body.length > MAX_ENVELOPE_BYTES) return fail('push', 'This board is too large to synchronize')

  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (res.status === 409) {
      const body = await readJson(res)
      const slot = body === null ? null : readSlot(body)
      // Not a failure: somebody wrote first, and what they wrote is in hand.
      return slot ? { status: 'stale', slot } : fail('push', 'Unreadable answer')
    }
    if (!res.ok) return fail('push', `Server said ${res.status}`)
    const answer = (await readJson(res)) as { revision?: unknown } | null
    if (answer === null) return fail('push', missing)
    return typeof answer.revision === 'number'
      ? { status: 'ok', revision: answer.revision }
      : fail('push', 'Unreadable answer')
  } catch {
    return fail('push', offline)
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
    if (!res.ok) reportFailure('sync/drop', `Server said ${res.status}`)
    return res.ok
  } catch {
    reportFailure('sync/drop', offline)
    return false
  }
}
