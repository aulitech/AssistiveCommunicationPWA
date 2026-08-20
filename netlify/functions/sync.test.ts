// The function, driven the way Netlify drives it: a `Request` in, a `Response`
// out, with the blob store replaced by a map. What is being checked is the part
// that has no second chance — this is the one piece of Peri that is exposed to
// anybody at all, and it takes writes from whoever knows an address.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MAX_ENVELOPE_BYTES, SYNC_FORMAT, SYNC_VERSION, type Envelope } from '../../src/core/sync'

const blobs = new Map<string, unknown>()

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => void blobs.set(key, value),
    delete: async (key: string) => void blobs.delete(key),
  }),
}))

const { default: handler } = await import('./sync.mts')

const ADDRESS = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

const envelope = (over: Partial<Envelope> = {}): Envelope => ({
  format: SYNC_FORMAT,
  version: SYNC_VERSION,
  updatedAt: 1000,
  device: 'aa11bb22',
  iv: 'aXY=',
  data: 'ZGF0YQ==',
  ...over,
})

const get = (address = ADDRESS) => handler(new Request(`https://peri.test/api/sync?a=${address}`))
const put = (body: unknown) =>
  handler(new Request('https://peri.test/api/sync', { method: 'PUT', body: JSON.stringify(body) }))
const remove = (address = ADDRESS) =>
  handler(new Request(`https://peri.test/api/sync?a=${address}`, { method: 'DELETE' }))

beforeEach(() => blobs.clear())

describe('fetching a board', () => {
  // What every account looks like until the first device pushes. It has to be a
  // real answer rather than a 404: a device that cannot tell "nothing here" from
  // "something went wrong" would either never make the first push or make it
  // every time.
  it('says an empty slot for an address nothing was written to', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ envelope: null, revision: 0 })
  })

  it('gives back what was put there', async () => {
    await put({ address: ADDRESS, envelope: envelope(), revision: 0 })
    expect(await (await get()).json()).toEqual({ envelope: envelope(), revision: 1 })
  })

  it('keeps two addresses apart', async () => {
    await put({ address: ADDRESS, envelope: envelope({ device: 'mine' }), revision: 0 })
    expect((await (await get(OTHER)).json()).envelope).toBeNull()
  })

  it('refuses an address that is not one', async () => {
    expect((await get('short')).status).toBe(400)
    expect((await get('../../etc/passwd')).status).toBe(400)
  })

  // A board is nobody's to keep in a cache, least of all a shared one.
  it('tells every cache to keep nothing', async () => {
    expect((await get()).headers.get('cache-control')).toBe('no-store')
  })
})

describe('writing a board', () => {
  it('takes the first write and counts from one', async () => {
    const res = await put({ address: ADDRESS, envelope: envelope(), revision: 0 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revision: 1 })
  })

  it('counts up from there', async () => {
    await put({ address: ADDRESS, envelope: envelope(), revision: 0 })
    const res = await put({ address: ADDRESS, envelope: envelope({ updatedAt: 2000 }), revision: 1 })
    expect(await res.json()).toEqual({ revision: 2 })
  })

  // The device that wrote first wins, and the loser is handed what is actually
  // there — one round trip settles it rather than two.
  it('refuses a write from a device that has not seen the last one, and says what it missed', async () => {
    await put({ address: ADDRESS, envelope: envelope({ device: 'first' }), revision: 0 })

    const res = await put({ address: ADDRESS, envelope: envelope({ device: 'second' }), revision: 0 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.revision).toBe(1)
    expect(body.envelope.device).toBe('first')

    // And the refusal really refused: the loser's board is not up there.
    expect((await (await get()).json()).envelope.device).toBe('first')
  })

  it('refuses anything that is not an envelope', async () => {
    expect((await put({ address: ADDRESS, envelope: { format: 'nope' }, revision: 0 })).status).toBe(400)
    expect((await put({ address: ADDRESS, revision: 0 })).status).toBe(400)
    expect((await put({ address: 'short', envelope: envelope(), revision: 0 })).status).toBe(400)
    expect((await put({ address: ADDRESS, envelope: envelope(), revision: -1 })).status).toBe(400)
  })

  it('refuses a body that is not JSON', async () => {
    const res = await handler(new Request('https://peri.test/api/sync', { method: 'PUT', body: 'not json' }))
    expect(res.status).toBe(400)
  })

  // The cap is the only thing between an open store and somebody's free disk.
  it('refuses a body past the limit', async () => {
    const res = await put({
      address: ADDRESS,
      envelope: envelope({ data: 'x'.repeat(MAX_ENVELOPE_BYTES) }),
      revision: 0,
    })
    expect(res.status).toBe(413)
    expect((await (await get()).json()).envelope).toBeNull()
  })
})

describe('erasing a board', () => {
  it('takes it away', async () => {
    await put({ address: ADDRESS, envelope: envelope(), revision: 0 })
    expect((await remove()).status).toBe(200)
    expect(await (await get()).json()).toEqual({ envelope: null, revision: 0 })
  })

  it('refuses an address that is not one', async () => {
    expect((await remove('nope')).status).toBe(400)
  })
})

describe('anything else', () => {
  it('is not allowed', async () => {
    const res = await handler(new Request('https://peri.test/api/sync', { method: 'POST' }))
    expect(res.status).toBe(405)
  })
})
