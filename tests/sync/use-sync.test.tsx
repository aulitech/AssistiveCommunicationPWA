// Two devices, one account, and the encrypted box between them.
//
// The box is **the real one**: this drives the hook through the real client into
// the real Netlify function, with only the blob store behind it replaced by a
// map. A hand-written stand-in for the server is a stand-in that drifts, and
// what it would then prove is that the hook agrees with a fiction.
//
// A second device is this device with its memory wiped and the server left
// standing — which is what a second device is.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, waitFor, act } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { useSync, type SyncControl } from '../../src/sync/use-sync'
import { deriveSyncKeys, open, seal } from '../../src/core/crypto'
import { SYNC_FORMAT, SYNC_VERSION, parseSnapshot, type Envelope, type SyncPayload } from '../../src/core/sync'
import type { Backup } from '../../src/core/backup'
import type { ElevenLabsAccount } from '../../src/core/store'

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

/**
 * A board. Shaped like a real one — `hasOwnBoard` reads it to decide whether
 * this device has anything worth asking about — but with one phrase standing in
 * for the couple of thousand a real one carries.
 */
const board = (mine?: string): Backup => ({
  format: 'peri-backup',
  version: 1,
  exported: '1970-01-01T00:00:00.000Z',
  scope: null,
  added: mine ? [{ id: mine, text: mine, category: 'Feelings' }] : [],
  edited: [],
  removed: [],
  categories: { created: [], renamed: {}, order: [] },
})

/** What the board that arrived, or the board on the server, actually says. */
const says = (b: Backup | undefined | null) => b?.added.map(p => p.text) ?? []

let requests: string[] = []

function serve() {
  requests = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    requests.push(`${init?.method ?? 'GET'} ${path.split('?')[0]}`)
    return handler(new Request(new URL(path, 'https://peri.test'), init))
  })
}

/** What is actually on the server, decrypted the way the other device would. */
async function boardOnServer(passphrase = PASSPHRASE, account = ACCOUNT) {
  const { address, key } = await deriveSyncKeys(passphrase, account)
  const slot = blobs.get(address) as { envelope: Envelope } | undefined
  if (!slot) return null
  const opened = await open(key, { iv: slot.envelope.iv, data: slot.envelope.data })
  return parseSnapshot(opened)
}

let control: SyncControl
let applied: { backup: Backup; account: ElevenLabsAccount | null; from: string }[] = []

/** One device. Its board changes only when the test says so. */
function Device({
  account = ACCOUNT as string | null,
  start,
  linked = null,
}: {
  account?: string | null
  start?: string
  /** The ElevenLabs account this device has linked, if any. */
  linked?: ElevenLabsAccount | null
}) {
  const [mine, setMine] = useState<SyncPayload>(() => ({ backup: board(start), account: linked }))
  const sync = useSync({
    accountId: account,
    payload: mine,
    onApply: (incoming, from) => {
      applied.push({ backup: incoming.backup, account: incoming.account, from })
      // What the screen does: what is on this device becomes what arrived.
      // Without it the hook would be tested against a device that ignores
      // everything it is sent.
      setMine(incoming)
    },
  })
  // Handed out in an effect rather than during the render: a render may be
  // thrown away, and the test would then be holding a control that never was.
  useEffect(() => {
    control = sync
  })
  return <button onClick={() => setMine(current => ({ ...current, backup: board('an edit') }))}>edit</button>
}

type Props = { account?: string | null; start?: string; linked?: ElevenLabsAccount | null }
const show = (props: Props = {}) => render(<Device {...props} />)

/**
 * The other device, writing while this one is not looking. Sealed with the same
 * key, so it is indistinguishable from a real one — which is what makes it
 * usable for the cases that need a board to change behind this device's back.
 */
async function writeAsAnotherDevice(phrase: string, updatedAt: number) {
  const { address, key } = await deriveSyncKeys(PASSPHRASE, ACCOUNT)
  const slot = blobs.get(address) as { revision: number } | undefined
  const sealed = await seal(key, { updatedAt, device: 'otherdev', backup: board(phrase), account: null })
  const res = await handler(
    new Request('https://peri.test/api/sync', {
      method: 'PUT',
      body: JSON.stringify({
        address,
        revision: slot?.revision ?? 0,
        envelope: {
          format: SYNC_FORMAT,
          version: SYNC_VERSION,
          updatedAt,
          device: 'otherdev',
          iv: sealed.iv,
          data: sealed.data,
        },
      }),
    }),
  )
  expect(res.status, 'the stand-in device could not write').toBe(200)
}

/** Wipe the device but leave the server standing. */
function secondDevice(props: Props = {}) {
  cleanup()
  localStorage.clear()
  applied = []
  return show(props)
}

beforeEach(() => {
  blobs.clear()
  applied = []
  serve()
})

afterEach(() => vi.unstubAllGlobals())

describe('before it is turned on', () => {
  it('does nothing at all', async () => {
    show()
    expect(control.status).toBe('off')
    expect(control.enabled).toBe(false)
    // A hundred milliseconds is long enough for a stray effect to have fired.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(requests).toEqual([])
  })

  // A guest is only ever this device: there is no account for a second one to
  // share. The row says so rather than offering a passphrase that means nothing.
  it('has nothing to synchronize with for a guest', async () => {
    show({ account: null })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('unavailable'))
    expect(requests).toEqual([])
  })
})

describe('the first device', () => {
  it('puts its board up, locked', async () => {
    show({ start: 'from the tablet' })
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(control.status).toBe('synced'))
    expect(says((await boardOnServer())?.backup)).toEqual(['from the tablet'])
  })

  // The whole promise: what is on the server is not a board, it is bytes.
  it('leaves nothing readable behind it', async () => {
    show({ start: 'the dog needs out' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    const stored = JSON.stringify([...blobs.values()])
    expect(stored).not.toContain('the dog needs out')
    expect(stored).not.toContain(PASSPHRASE)
    expect(stored).not.toContain(ACCOUNT)
  })

  it('sends an edit a moment after it is made', async () => {
    const { container } = show({ start: 'first phrase' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    act(() => container.querySelector('button')!.click())
    await waitFor(async () => expect(says((await boardOnServer())?.backup)).toEqual(['an edit']), {
      timeout: 5000,
    })
  })
})

describe('a second device joining', () => {
  /** A first device, with a board, already synchronized. */
  const publish = async (phrase: string) => {
    show({ start: phrase })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))
  }

  // Nothing of its own to lose: Peri as it ships. It takes what the account has
  // without troubling anybody about it, which is the whole point of the feature.
  it('takes the board the first one left', async () => {
    await publish('from the tablet')

    secondDevice()
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(applied).toHaveLength(1))
    expect(says(applied[0].backup)).toEqual(['from the tablet'])
  })

  // Having taken a board, it must not turn round and push it back as its own
  // news — which is a pair of devices talking to each other for ever.
  it('does not push back what it was just given', async () => {
    await publish('from the tablet')

    secondDevice()
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(applied).toHaveLength(1))

    requests = []
    // Past the debounce, which is where the bounce would land: taking a board
    // changes this device's board, and a change is what schedules a push.
    await new Promise(resolve => setTimeout(resolve, 2_500))
    expect(requests.filter(r => r.startsWith('PUT'))).toEqual([])
  })

  // Two boards, one account. Quietly choosing either is a way to lose somebody's
  // phrases, and which one they mean cannot be worked out from here.
  it('asks when both it and the account have a board', async () => {
    await publish('from the tablet')

    secondDevice({ start: 'from the phone' })
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(control.status).toBe('choose'))
    // And until it is answered, nothing has happened to either board.
    expect(applied).toEqual([])
    expect(says((await boardOnServer())?.backup)).toEqual(['from the tablet'])
  })

  it('publishes this device when that is the answer', async () => {
    await publish('from the tablet')
    secondDevice({ start: 'from the phone' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('choose'))

    act(() => control.keepMine())
    await waitFor(() => expect(control.status).toBe('synced'))
    expect(says((await boardOnServer())?.backup)).toEqual(['from the phone'])
    expect(applied).toEqual([])
  })

  it('takes the account board when that is the answer', async () => {
    await publish('from the tablet')
    secondDevice({ start: 'from the phone' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('choose'))

    act(() => control.takeTheirs())
    await waitFor(() => expect(applied).toHaveLength(1))
    expect(says(applied[0].backup)).toEqual(['from the tablet'])
  })

  // Asked once. A question that came back every minute would be a question
  // nobody could get past.
  it('does not ask twice', async () => {
    await publish('from the tablet')
    secondDevice({ start: 'from the phone' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('choose'))

    act(() => control.takeTheirs())
    await waitFor(() => expect(control.status).toBe('synced'))
    act(() => control.syncNow())
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(control.status).not.toBe('choose')
  })

  // Silent, and it has to be: a different passphrase is a different address, so
  // nothing arrives and — the part that matters — nothing is overwritten.
  it('reaches a different board when the passphrase is typed differently', async () => {
    await publish('from the tablet')
    const first = control.code

    secondDevice({ start: 'from the phone' })
    act(() => control.enable('the cat sat dowm'))
    await waitFor(() => expect(control.status).toBe('synced'))

    expect(control.code, 'the code exists so two devices can see they disagree').not.toBe(first)
    expect(applied).toEqual([])
    // Nothing arrived, and — the part that matters — nothing was overwritten.
    expect(says((await boardOnServer())?.backup)).toEqual(['from the tablet'])
    expect(says((await boardOnServer('the cat sat dowm'))?.backup)).toEqual(['from the phone'])
  })
})

/**
 * The ElevenLabs key, which a **backup file** deliberately never carries.
 *
 * The two are different questions with different answers: a backup is a file
 * made to be handed to somebody else, and the key in one hands over the
 * account. A snapshot is sealed with the user's own passphrase and reaches
 * their own devices and nowhere else.
 */
describe('the linked account', () => {
  const KEY: ElevenLabsAccount = { apiKey: 'sk-secret-key', voices: [{ id: 'v1', name: 'Rachel' }] }

  it('travels to the other device', async () => {
    show({ start: 'from the tablet', linked: KEY })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    secondDevice()
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(applied).toHaveLength(1))
    expect(applied[0].account).toEqual(KEY)
  })

  // It is inside the lock like everything else. The server holds bytes.
  it('is not readable on the server', async () => {
    show({ start: 'from the tablet', linked: KEY })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    expect(JSON.stringify([...blobs.values()])).not.toContain('sk-secret-key')
    expect((await boardOnServer())?.account).toEqual(KEY)
  })

  // Unlinking is a change like any other, and the other device follows. Said
  // explicitly rather than by omission — see the test after this one.
  it('goes when the board it arrives with has none', async () => {
    show({ start: 'from the tablet', linked: null })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    secondDevice({ linked: KEY })
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(applied).toHaveLength(1))
    expect(applied[0].account, 'the account outlived the board that had none').toBeNull()
  })

  /**
   * A snapshot written before the account travelled says nothing about one, and
   * nothing said is not the same as "no account". Taking it as an unlink would
   * have the first device on an older release strip the account off the others.
   */
  it('is left alone by a snapshot that says nothing about it', async () => {
    show({ start: 'mine', linked: KEY })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    const { address, key } = await deriveSyncKeys(PASSPHRASE, ACCOUNT)
    const slot = blobs.get(address) as { revision: number }
    const sealed = await seal(key, {
      updatedAt: Date.now() + 5_000,
      device: 'olddev',
      backup: board('from an older release'),
    })
    await handler(
      new Request('https://peri.test/api/sync', {
        method: 'PUT',
        body: JSON.stringify({
          address,
          revision: slot.revision,
          envelope: {
            format: SYNC_FORMAT,
            version: SYNC_VERSION,
            updatedAt: Date.now() + 5_000,
            device: 'olddev',
            iv: sealed.iv,
            data: sealed.data,
          },
        }),
      }),
    )

    act(() => control.syncNow())
    await waitFor(() => expect(applied).toHaveLength(1))
    expect(says(applied[0].backup)).toEqual(['from an older release'])
    expect(applied[0].account, 'an older snapshot unlinked the account').toEqual(KEY)
  })
})

describe('when it cannot be done', () => {
  it('says so and carries on', async () => {
    show({ start: 'mine' })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    act(() => control.enable(PASSPHRASE))

    await waitFor(() => expect(control.status).toBe('error'))
    expect(control.error).toBe('Could not reach the server')
    // And the board is exactly where it was. A failure to synchronize costs
    // nothing at all.
    expect(applied).toEqual([])
  })

  // The lock did not turn. Every reason for that is the same reason to the user.
  it('says the passphrase does not open the board when the lock does not turn', async () => {
    show({ start: 'from the tablet' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    // Somebody else's ciphertext, at this device's address: the same thing a
    // corrupted blob looks like from here.
    const { address } = await deriveSyncKeys(PASSPHRASE, ACCOUNT)
    const slot = blobs.get(address) as { envelope: Envelope; revision: number }
    blobs.set(address, {
      envelope: { ...slot.envelope, data: 'AAAA' + slot.envelope.data.slice(4), updatedAt: Date.now() + 10_000 },
      revision: slot.revision,
    })

    act(() => control.syncNow())
    await waitFor(() => expect(control.status).toBe('locked'))
    expect(applied).toEqual([])
  })
})

describe('turning it off', () => {
  it('stops talking to the server', async () => {
    show()
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))

    act(() => control.disable())
    requests = []
    act(() => control.syncNow())
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(requests).toEqual([])
    expect(control.status).toBe('off')
  })

  /**
   * Switching a device on again is not news.
   *
   * If turning the setting on stamped "now" on this device's board, every device
   * switched on would be the newest board in the world — and the first thing it
   * did would be to push whatever it happens to hold over whatever the account
   * has. Here, the account moved on while this device was off.
   */
  it('takes a board that changed while it was switched off', async () => {
    show({ start: 'from the tablet' })
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))
    const mine = JSON.parse(localStorage.getItem('peri_sync')!).updatedAt

    act(() => control.disable())
    // Newer than this device's board, and still in the past — which is exactly
    // what a board written by another device a moment ago looks like.
    await writeAsAnotherDevice('from the phone', mine + 1)
    await new Promise(resolve => setTimeout(resolve, 20))

    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(applied).toHaveLength(1))
    expect(says(applied[0].backup)).toEqual(['from the phone'])
  })

  // Turning it off and on again is a thing people do, and asking for the
  // passphrase a second time is asking to mistype it.
  it('keeps the passphrase, so it can be turned back on', async () => {
    show()
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))
    const code = control.code

    act(() => control.disable())
    expect(JSON.parse(localStorage.getItem('peri_sync')!).passphrase).toBe(PASSPHRASE)

    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))
    expect(control.code).toBe(code)
  })

  it('takes the copy off the server when asked to', async () => {
    show()
    act(() => control.enable(PASSPHRASE))
    await waitFor(() => expect(control.status).toBe('synced'))
    expect(await boardOnServer()).not.toBeNull()

    act(() => control.forget())
    await waitFor(async () => expect(await boardOnServer()).toBeNull())
    expect(JSON.parse(localStorage.getItem('peri_sync')!).passphrase).toBe('')
  })
})
