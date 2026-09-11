// Clips on the server, driven through the real Netlify function.
//
// The box is the real one, as in `use-sync.test.tsx`: the real client into the
// real handler, with only the blob store behind it replaced by a map. What a
// second device is here is the same keys used again with the memory wiped, which
// is exactly what a second device is.
//
// Two questions run through all of it. Does a clip bought once ever get bought
// again, and can the server tell anything at all about what it is holding.

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { deriveSyncKeys, open, seal, type SyncKeys } from '../../src/core/crypto'
import { MAX_CLIP_BYTES, clipStore, forgetClips, getClip, putClip } from '../../src/sync/audio'
import { type Envelope } from '../../src/core/sync'

const blobs = new Map<string, unknown>()

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => void blobs.set(key, value),
    delete: async (key: string) => void blobs.delete(key),
  }),
}))

const { default: handler } = await import('../../netlify/functions/sync.ts')

const ACCOUNT = 'google:1234'
const PASSPHRASE = 'the cat sat down'
const DEVICE = 'tablet'

const KEY = 'voice-1 I need the toilet'
const clip = (words: string, type = 'audio/mpeg') => new Blob([words], { type })

/** The derivation is a third of a second on purpose, so it is done once. */
let keys: SyncKeys
let otherAccount: SyncKeys

beforeAll(async () => {
  keys = await deriveSyncKeys(PASSPHRASE, ACCOUNT)
  otherAccount = await deriveSyncKeys(PASSPHRASE, 'google:9999')
})

function serve() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new Request(new URL(String(input), 'https://peri.test'), init)),
  )
}

beforeEach(() => {
  blobs.clear()
  serve()
})

/** Every key written into the index, read the way another device would. */
async function listed(from = keys): Promise<string[]> {
  const slot = blobs.get(from.clipIndexAddress) as { envelope: Envelope } | undefined
  if (!slot) return []
  return (await open(from.key, slot.envelope)) as string[]
}

describe('a clip one device paid for', () => {
  it('is found by another device with nothing but the words', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))

    const found = await getClip(keys, KEY)
    expect(await found?.text()).toBe('the audio')
  })

  // An `<audio>` element is handed the blob, and a blob with no type is one a
  // browser has to guess about.
  it('keeps what kind of audio it is', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio', 'audio/ogg'))
    expect((await getClip(keys, KEY))?.type).toBe('audio/ogg')
  })

  it('is nothing to an account that did not buy it', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))
    expect(await getClip(otherAccount, KEY)).toBeNull()
  })

  // The address is the words and the voice, so neither can be asked for with
  // the other — which is the whole of how a clip is found without a listing.
  it('is not found by different words', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))
    expect(await getClip(keys, 'voice-1 I need a drink')).toBeNull()
  })

  it('is not found by a different voice', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))
    expect(await getClip(keys, 'voice-2 I need the toilet')).toBeNull()
  })

  it('is nothing at all before anybody has bought it', async () => {
    expect(await getClip(keys, KEY)).toBeNull()
  })

  /**
   * Every address comes out of the same expansion, so the only thing keeping a
   * clip from landing on top of the board is the string each is derived under.
   * Asked of the awkward keys as well as a real one. The empty string is what
   * makes a prefix that is merely *different* not good enough; the board's own
   * info string is the value somebody would reach for by mistake; and `' index'`
   * is the whole reason a clip's prefix ends in a colon, since without one it
   * would run straight into the name the list is derived under.
   */
  it('is never kept where the board is, whatever the words are', async () => {
    for (const cacheKey of ['', ' ', ' index', KEY, 'peri-sync address', 'peri-sync clip index']) {
      const address = await keys.clipAddress(cacheKey)
      expect(address, cacheKey).not.toBe(keys.address)
      expect(address, cacheKey).not.toBe(keys.clipIndexAddress)
    }
    expect(keys.clipIndexAddress).not.toBe(keys.address)
  })

  it('does not land on top of the board', async () => {
    blobs.set(keys.address, { envelope: 'the board', revision: 7 })

    await putClip(keys, DEVICE, KEY, clip('the audio'))

    expect(blobs.get(keys.address)).toEqual({ envelope: 'the board', revision: 7 })
  })
})

/**
 * The board holds what somebody says about their own body, and a clip is that
 * said aloud. The server is given a number and a locked box.
 */
describe('what the server is given', () => {
  it('is an address that says nothing about the words', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))

    for (const address of blobs.keys()) {
      expect(address).toMatch(/^[0-9a-f]{64}$/)
      expect(address).not.toContain('toilet')
    }
  })

  it('is a box with no words in it', async () => {
    await putClip(keys, DEVICE, KEY, clip('I need the toilet'))

    const everything = JSON.stringify([...blobs.values()])
    expect(everything).not.toContain('toilet')
    expect(everything).not.toContain('voice-1')
  })
})

describe('the list of what has been uploaded', () => {
  // It exists for one purpose: an address nobody wrote down is an address
  // nobody can delete.
  it('names every clip that went up', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    await putClip(keys, DEVICE, 'voice-1 Hello', clip('two'))

    expect(await listed()).toEqual([KEY, 'voice-1 Hello'])
  })

  it('names a clip once however often it is offered', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    await putClip(keys, DEVICE, KEY, clip('one'))

    expect(await listed()).toEqual([KEY])
  })

  /**
   * The invariant, and it only runs one way: the list may name a clip that is
   * not there, which costs a wasted DELETE. A clip that nothing names would be
   * somebody's words left on a server after they asked for them back.
   */
  it('is written before the clip it names', async () => {
    const order: string[] = []
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { address: string }
        order.push(body.address === keys.clipIndexAddress ? 'list' : 'clip')
      }
      return real(input, init)
    })

    await putClip(keys, DEVICE, KEY, clip('the audio'))
    expect(order).toEqual(['list', 'clip'])
  })

  it('sends no clip at all when the list cannot be written', async () => {
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const isIndexWrite =
        init?.method === 'PUT' &&
        (JSON.parse(String(init.body)) as { address: string }).address === keys.clipIndexAddress
      if (isIndexWrite) return Promise.resolve(new Response('{}', { status: 500 }))
      return real(input, init)
    })

    await putClip(keys, DEVICE, KEY, clip('the audio'))
    expect(blobs.size).toBe(0)
  })

  /**
   * Two devices buying different clips in the same moment. The loser of the race
   * is handed what the winner wrote and adds to that rather than over it — the
   * same rule the board follows, and here it matters more, because a name lost
   * from this list is a clip that can never be taken off again.
   */
  it('keeps both when two devices write it at once', async () => {
    const real = globalThis.fetch
    let raced = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const isIndexWrite =
        init?.method === 'PUT' &&
        (JSON.parse(String(init.body)) as { address: string }).address === keys.clipIndexAddress
      // Exactly once, and only for the list: the other device gets there first.
      if (isIndexWrite && !raced) {
        raced = true
        await putClip(keys, 'phone', 'voice-1 Hello', clip('theirs'))
      }
      return real(input, init)
    })

    await putClip(keys, DEVICE, KEY, clip('mine'))

    expect((await listed()).sort()).toEqual(['voice-1 Hello', KEY].sort())
    expect(await (await getClip(keys, KEY))?.text()).toBe('mine')
    expect(await (await getClip(keys, 'voice-1 Hello'))?.text()).toBe('theirs')
  })
})

describe('taking the audio off the server', () => {
  it('takes every clip, and then the list of them', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    await putClip(keys, DEVICE, 'voice-1 Hello', clip('two'))

    await forgetClips(keys)

    expect(blobs.size).toBe(0)
  })

  it('has nothing to do when none went up', async () => {
    await forgetClips(keys)
    expect(blobs.size).toBe(0)
  })

  /**
   * `drop` answers with a value rather than throwing, so a refused DELETE is
   * walked straight past — and taking the list away over the top of one would
   * leave somebody's words at an address nothing now names, after they had asked
   * for them back. So the list goes only if every clip went.
   */
  it('keeps the list when a clip would not go', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE' && !String(input).includes(keys.clipIndexAddress)) {
        return Promise.resolve(new Response('{}', { status: 500 }))
      }
      return real(input, init)
    })

    await forgetClips(keys)
    serve()

    expect(await listed()).toEqual([KEY])
  })

  // Which is the whole point of keeping it: the second run finds the clip still
  // named and takes it.
  it('finishes the job when it is run again', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    const real = globalThis.fetch
    let refuse = true
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (refuse && init?.method === 'DELETE' && !String(input).includes(keys.clipIndexAddress)) {
        return Promise.resolve(new Response('{}', { status: 500 }))
      }
      return real(input, init)
    })
    await forgetClips(keys)

    refuse = false
    await forgetClips(keys)

    expect(blobs.size).toBe(0)
  })
})

/**
 * Sync is the one part of Peri allowed to fail, and here a failure costs a clip
 * bought twice rather than a phrase nobody can say.
 */
describe('when it does not work', () => {
  it('says nothing came back when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    expect(await getClip(keys, KEY)).toBeNull()
  })

  it('sends nothing, and does not throw, when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(putClip(keys, DEVICE, KEY, clip('the audio'))).resolves.toBeUndefined()
    expect(blobs.size).toBe(0)
  })

  // GCM authenticates, so one altered byte fails exactly as a wrong key does —
  // and a clip that will not open is a clip bought again, not a phrase lost.
  it('reads nothing out of a box somebody has been at', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))
    const address = await keys.clipAddress(KEY)
    const slot = blobs.get(address) as { envelope: Envelope; revision: number }
    const data = slot.envelope.data
    blobs.set(address, {
      ...slot,
      envelope: { ...slot.envelope, data: (data[0] === 'A' ? 'B' : 'A') + data.slice(1) },
    })

    expect(await getClip(keys, KEY)).toBeNull()
  })

  // Sealed, so nothing on the wire could put it there — but a clip whose bytes
  // are not text at all must read as nothing rather than as a blob of junk
  // handed to a speaker.
  it('reads nothing out of a clip whose bytes are not text', async () => {
    const address = await keys.clipAddress(KEY)
    blobs.set(address, {
      envelope: {
        format: 'peri-sync',
        version: 1,
        updatedAt: 0,
        device: DEVICE,
        ...(await seal(keys.key, { type: 'audio/mpeg', data: null })),
      },
      revision: 1,
    })

    expect(await getClip(keys, KEY)).toBeNull()
  })

  // Same: what is in the list is read rather than trusted, so one damaged entry
  // does not take the rest of the clean-up down with it.
  it('takes the clips a damaged list still names', async () => {
    await putClip(keys, DEVICE, KEY, clip('one'))
    blobs.set(keys.clipIndexAddress, {
      envelope: {
        format: 'peri-sync',
        version: 1,
        updatedAt: 0,
        device: DEVICE,
        ...(await seal(keys.key, [KEY, 42, null, { a: 1 }])),
      },
      revision: 1,
    })

    await forgetClips(keys)

    expect(blobs.size).toBe(0)
  })

  it('reads nothing out of a box holding something that is not a clip', async () => {
    await putClip(keys, DEVICE, KEY, clip('the audio'))
    const address = await keys.clipAddress(KEY)
    const slot = blobs.get(address) as { envelope: Envelope; revision: number }
    blobs.set(address, { ...slot, envelope: { ...slot.envelope, data: 'not base64 ciphertext' } })

    expect(await getClip(keys, KEY)).toBeNull()
  })

  /**
   * The size cap is what keeps this from being somebody's free disk, and half a
   * minute of speech is far longer than anything a board says. A clip past it
   * works exactly as before — locally, and bought once per device.
   */
  it('keeps a clip too large to send at home', async () => {
    await putClip(keys, DEVICE, KEY, new Blob([new Uint8Array(MAX_CLIP_BYTES + 1)]))
    expect(blobs.size).toBe(0)
  })
})

describe('the pair of calls the audio cache is given', () => {
  it('finds what was put up', async () => {
    const store = clipStore(keys, DEVICE)
    await putClip(keys, DEVICE, KEY, clip('the audio'))

    expect(await (await store.get(KEY))?.text()).toBe('the audio')
  })

  // This is somebody mid-sentence, and the clip they are about to hear is
  // already in hand — so nothing about sending it may be waited on.
  it('does not make the caller wait to send one', async () => {
    const store = clipStore(keys, DEVICE)
    expect(store.put(KEY, clip('the audio'))).toBeUndefined()

    await vi.waitFor(async () => expect(await listed()).toEqual([KEY]))
  })
})
