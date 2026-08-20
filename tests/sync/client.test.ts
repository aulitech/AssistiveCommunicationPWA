// The four calls to `/api/sync`, and what each of them makes of an answer.
//
// The exchange itself is tested through the hook, against the real function.
// What is left for here is the answers a *server* can give that a function
// never would — because the endpoint is not there, because something in front
// of it answered first, or because the network did not.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { pull, push } from '../../src/sync/client'
import { SYNC_FORMAT, SYNC_VERSION, type Envelope } from '../../src/core/sync'

const ADDRESS = 'a'.repeat(64)

const envelope = (): Envelope => ({
  format: SYNC_FORMAT,
  version: SYNC_VERSION,
  updatedAt: 1000,
  device: 'aa11bb22',
  iv: 'aXY=',
  data: 'ZGF0YQ==',
})

const answers = (body: string, init: ResponseInit = {}) =>
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init }),
    ),
  )

afterEach(() => vi.unstubAllGlobals())

/**
 * The failure this app actually shipped.
 *
 * The endpoint was never deployed, and a missing endpoint here is not a 404:
 * the SPA catch-all rewrites anything that is not a file on disk to the app, so
 * the answer was **200, with `<!doctype html>` in it**. A client that trusts
 * `res.ok` sees that as success and then throws on the first `{` it cannot
 * find — a crash, in the one place that is supposed to fail into a line of text.
 */
describe('an answer that is not from the function', () => {
  const html = { headers: { 'content-type': 'text/html; charset=UTF-8' } }

  it('is refused rather than parsed, on the way in', async () => {
    answers('<!doctype html><html><body>Peri</body></html>', html)
    expect(await pull(ADDRESS)).toEqual({
      status: 'error',
      error: 'Synchronizing is not available on this server',
    })
  })

  it('is refused on the way out too', async () => {
    answers('<!doctype html><html><body>Peri</body></html>', html)
    expect(await push(ADDRESS, envelope(), 0)).toEqual({
      status: 'error',
      error: 'Synchronizing is not available on this server',
    })
  })

  // Right header, wrong contents. Still not a board, and still not a throw.
  it('refuses JSON that says nothing it needs', async () => {
    answers('{"hello":"there"}')
    expect((await pull(ADDRESS)).status).toBe('error')
    expect((await push(ADDRESS, envelope(), 0)).status).toBe('error')
  })

  it('refuses a body that is broken off halfway', async () => {
    answers('{"revision": 1')
    expect((await pull(ADDRESS)).status).toBe('error')
  })
})

describe('an answer that is', () => {
  it('reads a slot with nothing in it', async () => {
    answers('{"envelope":null,"revision":0}')
    expect(await pull(ADDRESS)).toEqual({ status: 'ok', slot: { envelope: null, revision: 0 } })
  })

  it('reads a slot with a board in it', async () => {
    answers(JSON.stringify({ envelope: envelope(), revision: 3 }))
    expect(await pull(ADDRESS)).toEqual({ status: 'ok', slot: { envelope: envelope(), revision: 3 } })
  })

  it('reads a revision back from a write', async () => {
    answers('{"revision":4}')
    expect(await push(ADDRESS, envelope(), 3)).toEqual({ status: 'ok', revision: 4 })
  })

  it('reads a refusal, and what came back with it', async () => {
    answers(JSON.stringify({ envelope: envelope(), revision: 7 }), { status: 409 })
    expect(await push(ADDRESS, envelope(), 3)).toEqual({
      status: 'stale',
      slot: { envelope: envelope(), revision: 7 },
    })
  })
})

// Sync is the one part of Peri allowed to fail: a board works offline, and a
// device that cannot reach the server has lost nothing at all.
describe('no answer', () => {
  it('is a value, never a throw', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    expect(await pull(ADDRESS)).toEqual({ status: 'error', error: 'Could not reach the server' })
    expect(await push(ADDRESS, envelope(), 0)).toEqual({ status: 'error', error: 'Could not reach the server' })
  })

  it('says what the server said when it said something', async () => {
    answers('{}', { status: 500 })
    expect(await pull(ADDRESS)).toEqual({ status: 'error', error: 'Server said 500' })
  })
})
