import { describe, it, expect } from 'vitest'
import { deriveSyncKeys, open, seal, syncCode } from '../../src/core/crypto'

// The lock on a synchronized board. Everything here is about one promise: what
// leaves the device cannot be read by whatever holds it.

const keysFor = (passphrase: string, account = 'google:1234') => deriveSyncKeys(passphrase, account)

describe('deriving an address and a key', () => {
  it('gives the same pair to two devices that agree', async () => {
    const a = await keysFor('open sesame')
    const b = await keysFor('open sesame')
    expect(a.address).toBe(b.address)

    // And the keys really are the same key, which is the half an address cannot
    // show: one device seals, the other opens.
    const sealed = await seal(a.key, { hello: 'there' })
    expect(await open(b.key, sealed)).toEqual({ hello: 'there' })
  })

  // Two people who happen to choose the same passphrase are still two boards.
  // The account is the salt, so nothing derived for one is worth anything
  // against the other.
  it('gives different accounts different addresses', async () => {
    const mine = await keysFor('open sesame', 'google:1234')
    const yours = await keysFor('open sesame', 'google:5678')
    expect(mine.address).not.toBe(yours.address)
  })

  it('gives a different passphrase a different address', async () => {
    const right = await keysFor('open sesame')
    const typo = await keysFor('open sesamr')
    expect(right.address).not.toBe(typo.address)
  })

  /**
   * The reason the two are separate derivations rather than one.
   *
   * The address is handed to the server on every request; the key never leaves
   * the device. Derive them the same way and the second is the first — anybody
   * holding a request log would hold the key to every board in it. HKDF with a
   * different label each time is what keeps one from being worked back to the
   * other, and nothing else in this file would notice if it stopped.
   */
  it('does not hand the key to whoever holds the address', async () => {
    const { address, key } = await keysFor('open sesame')
    const sealed = await seal(key, { secret: 'the dog needs out' })

    const bytes = Uint8Array.from(address.match(/../g)!.map(pair => parseInt(pair, 16)))
    const asKey = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
    expect(await open(asKey, sealed), 'the address is the key').toBeNull()
  })

  // The whole of a SHA-256's worth. A shorter address would be a smaller
  // keyspace than the derivation promises, and the server checks this shape.
  it('is 64 characters of lowercase hex', async () => {
    const { address } = await keysFor('open sesame')
    expect(address).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('locking a board', () => {
  it('comes back the same board', async () => {
    const { key } = await keysFor('open sesame')
    const board = { added: [{ id: 'a', text: 'I am cold', category: 'Feelings' }], n: 3, deep: { ok: true } }
    expect(await open(key, await seal(key, board))).toEqual(board)
  })

  // The one way to break AES-GCM outright is to use an IV twice under the same
  // key, so the same board sealed twice must not produce the same bytes.
  it('never seals the same thing the same way twice', async () => {
    const { key } = await keysFor('open sesame')
    const first = await seal(key, { same: 'board' })
    const second = await seal(key, { same: 'board' })
    expect(first.iv).not.toBe(second.iv)
    expect(first.data).not.toBe(second.data)
  })

  // A wrong passphrase is an address nothing is stored at, so this is really the
  // case of somebody who *shares* an account and mistyped: they reach the right
  // blob and cannot open it. Null rather than a throw — the caller has a line of
  // text to show, not an exception to handle.
  it('will not open under the wrong key', async () => {
    const right = await keysFor('open sesame')
    const wrong = await keysFor('open sesamr')
    expect(await open(wrong.key, await seal(right.key, { secret: true }))).toBeNull()
  })

  // GCM authenticates as well as encrypts, which is what makes an open store
  // safe to write to: a board altered on the server does not decrypt into a
  // board that was never written, it does not decrypt at all.
  it('will not open something that was altered', async () => {
    const { key } = await keysFor('open sesame')
    const sealed = await seal(key, { secret: true })
    const flipped = sealed.data.slice(0, -2) + (sealed.data.endsWith('A') ? 'B=' : 'A=')
    expect(await open(key, { ...sealed, data: flipped })).toBeNull()
  })

  it('will not open rubbish', async () => {
    const { key } = await keysFor('open sesame')
    expect(await open(key, { iv: 'not base64 at all!!', data: 'nor this' })).toBeNull()
  })
})

// Two devices sync only if they agree on the passphrase. A passphrase typed
// differently on the second one is silent — a different address, so nothing
// arrives and nothing is lost, which looks exactly like sync being broken.
describe('the code two devices compare', () => {
  it('is the same on two devices that agree, and short enough to read out', async () => {
    const a = await keysFor('open sesame')
    const b = await keysFor('open sesame')
    expect(syncCode(a.address)).toBe(syncCode(b.address))
    expect(syncCode(a.address)).toMatch(/^[0-9A-F]{6}$/)
  })

  it('differs where the passphrases differ', async () => {
    const right = await keysFor('open sesame')
    const typo = await keysFor('open sesamr')
    expect(syncCode(right.address)).not.toBe(syncCode(typo.address))
  })
})
