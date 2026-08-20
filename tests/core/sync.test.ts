import { describe, it, expect } from 'vitest'
import {
  MAX_ENVELOPE_BYTES,
  SYNC_EPOCH,
  SYNC_FORMAT,
  SYNC_VERSION,
  decideSync,
  newDeviceId,
  parseEnvelope,
  parseSnapshot,
  readAddress,
  readRevision,
  type Envelope,
} from '../../src/core/sync'
import { buildBackup } from '../../src/core/backup'
import { DEFAULT_SETTINGS, emptyStore, loadElevenLabs, saveElevenLabs } from '../../src/core/store'
import { EMPTY_ALIASES } from '../../src/core/phrases'

const envelope = (over: Partial<Envelope> = {}): Envelope => ({
  format: SYNC_FORMAT,
  version: SYNC_VERSION,
  updatedAt: 1000,
  device: 'aa11bb22',
  iv: 'aXY=',
  data: 'ZGF0YQ==',
  ...over,
})

// Which way to sync, and it is the part with the interesting mistakes in it.
describe('deciding which way to sync', () => {
  const local = (updatedAt: number, dirty: boolean) => ({ updatedAt, dirty })
  const remote = (updatedAt: number, device = 'other') => ({ updatedAt, device })

  // Without this a board somebody has spent a year building sits there
  // unsynchronized until they happen to edit a phrase.
  it('pushes to an empty server whether or not anything has changed', () => {
    expect(decideSync(local(500, false), null)).toBe('push')
    expect(decideSync(local(0, false), null)).toBe('push')
  })

  it('pulls what is newer than this device', () => {
    expect(decideSync(local(500, false), remote(900))).toBe('pull')
  })

  // Even where this device has unsent changes of its own. The newer board wins
  // whole — see the note on `decideSync` about what that costs.
  it('pulls what is newer even over changes of its own', () => {
    expect(decideSync(local(500, true), remote(900))).toBe('pull')
  })

  it('pushes what this device has that the server has not', () => {
    expect(decideSync(local(900, true), remote(500))).toBe('push')
  })

  it('does nothing when neither has news', () => {
    expect(decideSync(local(900, false), remote(500))).toBe('idle')
    expect(decideSync(local(900, false), remote(900))).toBe('idle')
  })

  // The echo of this device's own push, which is what every poll after a sync
  // looks like. Answering it with another push would be a loop.
  it('does not pull back what this device just wrote', () => {
    expect(decideSync(local(900, false), remote(900, 'this'))).toBe('idle')
  })

  // A second tab shares this device's id and can still hold a newer board, so
  // what decides is the clock and never the name.
  it('pulls something newer written under this device name', () => {
    expect(decideSync(local(500, false), remote(900, 'this'))).toBe('pull')
  })
})

describe('reading an envelope', () => {
  it('takes one', () => {
    expect(parseEnvelope(envelope())).toEqual(envelope())
  })

  it('refuses anything that is not one', () => {
    expect(parseEnvelope(null)).toBeNull()
    expect(parseEnvelope('a board')).toBeNull()
    expect(parseEnvelope({})).toBeNull()
    expect(parseEnvelope(envelope({ format: 'something-else' as typeof SYNC_FORMAT }))).toBeNull()
  })

  // A device must not try to open a format written by a later release: what it
  // would make of the contents is a guess, and a guess applied to somebody's
  // board is worse than waiting for the update.
  it('refuses a version from the future', () => {
    expect(parseEnvelope(envelope({ version: SYNC_VERSION + 1 }))).toBeNull()
  })

  it('refuses a missing or unusable timestamp', () => {
    expect(parseEnvelope(envelope({ updatedAt: undefined as unknown as number }))).toBeNull()
    expect(parseEnvelope(envelope({ updatedAt: Number.NaN }))).toBeNull()
  })

  // The server takes writes from anyone who knows an address, so the shape is
  // the whole of what it can check. A device name is a name, not a payload.
  it('refuses a device name long enough to be a payload', () => {
    expect(parseEnvelope(envelope({ device: 'x'.repeat(65) }))).toBeNull()
  })

  it('keeps nothing the sender added', () => {
    const parsed = parseEnvelope({ ...envelope(), sneaky: 'value' })
    expect(parsed).not.toBeNull()
    expect(Object.keys(parsed!)).toEqual(['format', 'version', 'updatedAt', 'device', 'iv', 'data'])
  })
})

describe('reading a snapshot', () => {
  const base = { updatedAt: 5, device: 'aa11bb22', backup: { format: 'peri-backup' } }

  it('takes one', () => {
    expect(parseSnapshot(base)).toEqual(base)
  })

  it('refuses one with nothing in it', () => {
    expect(parseSnapshot({ updatedAt: 5, device: 'a' })).toBeNull()
    expect(parseSnapshot({ updatedAt: 'soon', device: 'a', backup: {} })).toBeNull()
    expect(parseSnapshot(null)).toBeNull()
  })

  /**
   * The account has **three** states and only two of them are instructions.
   * A snapshot written before the account travelled says nothing about one, and
   * taking that as an unlink would have a device on an older release strip the
   * account off every other device on the account.
   */
  describe('the account it may carry', () => {
    const account = { apiKey: 'sk-key', voices: [{ id: 'v1', name: 'Rachel' }] }

    it('takes an account', () => {
      expect(parseSnapshot({ ...base, account })?.account).toEqual(account)
    })

    it('takes an explicit "no account" as an instruction', () => {
      expect(parseSnapshot({ ...base, account: null })?.account).toBeNull()
    })

    it('leaves it out entirely where the snapshot said nothing', () => {
      const parsed = parseSnapshot(base)
      expect(parsed).not.toBeNull()
      expect('account' in parsed!, 'silence was turned into an unlink').toBe(false)
    })

    it('says nothing rather than taking half an account', () => {
      expect(parseSnapshot({ ...base, account: { voices: [] } })?.account).toBeUndefined()
      expect(parseSnapshot({ ...base, account: { apiKey: '', voices: [] } })?.account).toBeUndefined()
      expect(parseSnapshot({ ...base, account: { apiKey: 'sk-key' } })?.account).toBeUndefined()
    })
  })
})

/**
 * The one thing sync carries that a backup file will not, and the reason it can:
 * a backup is made to be handed to somebody else, and the key in one hands over
 * the account. A snapshot is sealed with the user's own passphrase and reaches
 * their own devices and nowhere else.
 */
describe('what a snapshot carries and a backup does not', () => {
  it('keeps the ElevenLabs key out of the exported document', () => {
    saveElevenLabs({ apiKey: 'sk-secret-key', voices: [{ id: 'v1', name: 'Rachel' }] })
    const backup = buildBackup({
      store: emptyStore(),
      aliases: EMPTY_ALIASES,
      settings: DEFAULT_SETTINGS,
      categoryById: new Map<string, string>(),
      now: SYNC_EPOCH,
    })

    expect(JSON.stringify(backup)).not.toContain('sk-secret-key')
    // And the snapshot is where it does travel — beside the backup, never in it.
    const snapshot = { updatedAt: 1, device: 'aa11bb22', backup, account: loadElevenLabs() }
    expect(parseSnapshot(snapshot)?.account?.apiKey).toBe('sk-secret-key')
  })
})

describe('reading an address', () => {
  const good = 'a'.repeat(64)

  it('takes the whole of one and nothing less', () => {
    expect(readAddress(good)).toBe(good)
    expect(readAddress('a'.repeat(63))).toBeNull()
    expect(readAddress('a'.repeat(65))).toBeNull()
  })

  it('refuses anything that is not lowercase hex', () => {
    expect(readAddress('A'.repeat(64))).toBeNull()
    expect(readAddress('g'.repeat(64))).toBeNull()
    expect(readAddress('../etc/passwd')).toBeNull()
    expect(readAddress(null)).toBeNull()
    expect(readAddress('')).toBeNull()
  })
})

describe('reading a revision', () => {
  // Absent is a real answer: it is what a device that has never synced sends.
  it('reads nothing as nothing seen', () => {
    expect(readRevision(undefined)).toBe(0)
    expect(readRevision(null)).toBe(0)
  })

  it('takes a whole number of revisions', () => {
    expect(readRevision(0)).toBe(0)
    expect(readRevision(7)).toBe(7)
  })

  it('refuses what is not one', () => {
    expect(readRevision(-1)).toBeNull()
    expect(readRevision(1.5)).toBeNull()
    expect(readRevision('7')).toBeNull()
    expect(readRevision(Number.NaN)).toBeNull()
  })
})

describe('naming a device', () => {
  it('is short, hex, and different every time', () => {
    const one = newDeviceId()
    expect(one).toMatch(/^[0-9a-f]{8}$/)
    expect(new Set([one, newDeviceId(), newDeviceId()]).size).toBe(3)
  })
})

/**
 * The property that stops a device pushing for ever.
 *
 * `buildBackup` stamps the moment it ran, which is right for a file somebody
 * saves and wrong for sync: the board is compared with itself as it was, so a
 * document that differs only in its timestamp is a board that looks edited on
 * every render.
 */
describe('the document sync ships', () => {
  const board = () => ({
    store: emptyStore(),
    aliases: EMPTY_ALIASES,
    settings: DEFAULT_SETTINGS,
    categoryById: new Map<string, string>(),
  })

  it('is identical when nothing has changed', () => {
    const first = buildBackup({ ...board(), now: SYNC_EPOCH })
    const second = buildBackup({ ...board(), now: SYNC_EPOCH })
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('differs when something has', () => {
    const before = buildBackup({ ...board(), now: SYNC_EPOCH })
    const state = board()
    state.store.custom = [{ id: 'c1', text: 'Put the kettle on', category: 'Food' }]
    state.categoryById = new Map([['c1', 'Food']])
    const after = buildBackup({ ...state, now: SYNC_EPOCH })
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
  })

  // Belt and braces on the same claim: whatever else `now` is used for, the
  // stamped date must not be today's.
  it('carries no moving date', () => {
    expect(buildBackup({ ...board(), now: SYNC_EPOCH }).exported).toBe(SYNC_EPOCH.toISOString())
  })
})

describe('how large an envelope may be', () => {
  // The server takes writes from anyone who knows an address, so the cap is the
  // only thing between it and being used as somebody's free disk.
  it('is large enough for a board and small enough to be a limit', () => {
    expect(MAX_ENVELOPE_BYTES).toBeGreaterThan(100_000)
    expect(MAX_ENVELOPE_BYTES).toBeLessThanOrEqual(2_000_000)
  })
})
