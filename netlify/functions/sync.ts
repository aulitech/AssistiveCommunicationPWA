// The one piece of Peri that runs on a server.
//
// **`.ts`, not `.mts`.** It was written as `.mts` and Netlify simply did not
// pick it up: the build went green, no function was deployed, and `/api/sync`
// fell through the redirect to the app shell — a 200 with HTML in it, which is
// the one failure shape a client checking `res.ok` cannot see. `sync/client.ts`
// now refuses an answer that is not JSON for exactly that reason.
//
// It is a locked box with a number on it. A device asks for the box at an
// address, or puts a new one there; the address is 32 bytes of hex that only a
// device holding the passphrase can work out, and what goes in the box is
// already encrypted before it arrives. This function cannot read a board, and
// neither can anyone with access to the store behind it. See `src/core/crypto`
// for how the address and the key are derived.
//
// **There is no account here, and that is the design rather than an omission.**
// The alternative was to keep an OAuth token on each device and verify it with
// Google, Apple or Facebook on every request — a stronger door, at the price of
// long-lived provider tokens sitting in `localStorage` on a device somebody
// leaves in a day room. Since the contents are useless without the passphrase,
// what an account would protect is not the board but the *slot*: who may write
// over it. So the address is the credential, and the rules below are what stands
// in for one.
//
// What that leaves open, stated plainly:
//
//  * Anyone who learns an address may read the ciphertext and overwrite it. An
//    address is 256 bits derived from a secret, so learning one means already
//    having the passphrase — but it is not a password check, and a wrong guess
//    is not counted or slowed.
//  * Writes are capped by shape and size, and by nothing else. This is not a
//    general-purpose store, but it is an open one.
//
// The revision is optimistic and not atomic: two devices that read the same
// revision within the same instant can both write, and the later write wins.
// Blobs offers no compare-and-swap, and the consequence is bounded — the device
// whose write was lost sees a newer revision on its next poll and reconciles.

import { getStore } from '@netlify/blobs'
// The wire format and nothing else. `src/core/sync.ts` holds the rest — the
// snapshot, the conflict rule, what a device does with what it finds — and
// importing it here would put the phrase table in this Lambda.
import {
  MAX_ENVELOPE_BYTES,
  parseEnvelope,
  readAddress,
  readRevision,
  type Envelope,
} from '../../src/core/envelope'

const STORE = 'peri-sync'

/** What is kept under an address. */
interface Slot {
  envelope: Envelope
  /** Bumped on every write, and what a device sends back to prove it is current. */
  revision: number
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // A board is nobody's to keep in a cache, least of all a shared one.
      'cache-control': 'no-store',
    },
  })

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const store = getStore({ name: STORE, consistency: 'strong' })

  if (req.method === 'GET') {
    const address = readAddress(url.searchParams.get('a'))
    if (!address) return json({ error: 'bad address' }, 400)
    const slot = (await store.get(address, { type: 'json' })) as Slot | null
    return json(slot ?? { envelope: null, revision: 0 })
  }

  if (req.method === 'PUT') {
    const raw = await req.text()
    if (raw.length > MAX_ENVELOPE_BYTES) return json({ error: 'too large' }, 413)

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'bad body' }, 400)
    }

    const address = readAddress(typeof body.address === 'string' ? body.address : null)
    const revision = readRevision(body.revision)
    const envelope = parseEnvelope(body.envelope)
    if (!address || revision === null || !envelope) return json({ error: 'bad body' }, 400)

    const current = (await store.get(address, { type: 'json' })) as Slot | null
    // Stale: somebody else wrote since this device last looked. Hand back what
    // is there rather than only refusing, so one round trip settles it.
    if ((current?.revision ?? 0) !== revision) {
      return json({ conflict: true, ...(current ?? { envelope: null, revision: 0 }) }, 409)
    }

    const next: Slot = { envelope, revision: revision + 1 }
    await store.setJSON(address, next)
    return json({ revision: next.revision })
  }

  if (req.method === 'DELETE') {
    const address = readAddress(url.searchParams.get('a'))
    if (!address) return json({ error: 'bad address' }, 400)
    await store.delete(address)
    return json({ ok: true })
  }

  return json({ error: 'method not allowed' }, 405)
}
