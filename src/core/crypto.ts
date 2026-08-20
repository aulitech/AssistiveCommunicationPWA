// Locking a board before it leaves the device.
//
// Synchronizing means a copy of somebody's board sits on a server, and a board
// holds the things this app exists to say: who to call, what hurts, what help is
// needed in a bathroom. So the server is given ciphertext and nothing else. It
// cannot read a board, and neither can we.
//
// One passphrase does two jobs, and it is worth being clear about why:
//
//  * **It unlocks the board.** An AES-GCM key, derived from the passphrase.
//  * **It is also the address the board is stored under.** A second key derived
//    from the same passphrase, written as hex. Nobody who does not know the
//    passphrase can even find the blob, let alone read it — which is what lets
//    the server ask no questions and hold no accounts. The alternative was to
//    keep an OAuth token on the device and verify it server-side, which trades
//    a stronger door for a much worse thing to lose.
//
// The two are derived through HKDF from a single PBKDF2 output rather than being
// two PBKDF2 runs: one slow derivation, two keys that cannot be worked back to
// each other. A server that knows the address learns nothing about the key.
//
// The account is the salt. Two people who choose the same passphrase are still
// two different addresses, and a table built against one account is worth
// nothing against another.

/** Cost of the derivation. OWASP's floor for PBKDF2-SHA256, and it is a floor. */
export const KDF_ITERATIONS = 310_000

/** What the two derived keys are for. Distinct, or they would be the same key. */
const ADDRESS_INFO = 'peri-sync address'
const DATA_INFO = 'peri-sync data'

/** Namespaced so a passphrase used here derives nothing usable anywhere else. */
const SALT_PREFIX = 'peri-sync-v1:'

const utf8 = (s: string) => new TextEncoder().encode(s)

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  // A spread would blow the argument limit on anything large; a board is small
  // today and this is the kind of limit that is discovered in the field.
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))

const toHex = (bytes: Uint8Array) =>
  [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

/**
 * Where a board is kept and what unlocks it.
 *
 * `address` is public in the sense that the server sees it; it reveals nothing
 * but the fact that some board exists. `key` never leaves the device.
 */
export interface SyncKeys {
  address: string
  key: CryptoKey
}

/**
 * Turn a passphrase and an account into an address and a key.
 *
 * Deliberately slow — a third of a second or so on a tablet — because the only
 * thing standing between a stolen ciphertext and a board is how long it takes to
 * guess the passphrase. Derived once per session and kept in memory; anything
 * that re-derives it on every sync has made a mistake.
 */
export async function deriveSyncKeys(passphrase: string, accountId: string): Promise<SyncKeys> {
  const base = await crypto.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveBits'])
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: utf8(SALT_PREFIX + accountId), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    base,
    256,
  )

  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const expand = { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0) } as const

  const address = await crypto.subtle.deriveBits({ ...expand, info: utf8(ADDRESS_INFO) }, hkdf, 256)
  const key = await crypto.subtle.deriveKey(
    { ...expand, info: utf8(DATA_INFO) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  return { address: toHex(new Uint8Array(address)), key }
}

/** Ciphertext and the number used once that made it. */
export interface Sealed {
  iv: string
  data: string
}

/**
 * A fresh IV every time, because reusing one under the same key is the single
 * way to break AES-GCM outright. Twelve bytes is what GCM is specified for.
 */
export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(value)))
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

/**
 * The value back, or null where it cannot be had.
 *
 * Null is the answer for a wrong passphrase, a truncated blob and a tampered
 * one alike — GCM authenticates, so a single altered byte fails the same way a
 * wrong key does. The caller cannot tell them apart and should not pretend to:
 * what it says to the user is that this passphrase does not open this board.
 */
export async function open(key: CryptoKey, sealed: Sealed): Promise<unknown | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.data),
    )
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    return null
  }
}

/**
 * Six characters of the address, for reading out loud.
 *
 * Two devices sync only if they agree on the passphrase, and a passphrase typed
 * wrongly on the second one is silent: it addresses a different board, so
 * nothing arrives and nothing is lost, which looks exactly like sync being
 * broken. The code is how somebody checks. It is a prefix of a public value, so
 * showing it gives away nothing that the server does not already have.
 */
export const syncCode = (address: string) => address.slice(0, 6).toUpperCase()
