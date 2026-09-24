// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { newDeviceId } from '../sync'
import { SYNC_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── Synchronizing ────────────────────────────────────────────────────────────

/**
 * What this device knows about synchronizing, and **none of it is in a backup.**
 *
 * The same reasoning that keeps the ElevenLabs key out of one: a backup is a
 * file made to be handed to somebody else, and the passphrase in it hands over
 * the board on every device that shares it. The flag is out for a second reason
 * — restoring somebody else's file must not switch a stranger's device on and
 * start it writing to a server.
 *
 * `updatedAt` and `dirty` are written down rather than kept in memory because a
 * device that is edited on a train and closed before it reaches a signal has to
 * remember, when it opens again, that it is the one holding the newer board.
 */
export interface SyncConfig {
  enabled: boolean
  /** Empty until somebody sets one. Sync cannot start without it. */
  passphrase: string
  /** This browser profile. Only ever shown, to say which device wrote last. */
  device: string
  /** When this device's board last changed. */
  updatedAt: number
  /** Whether that change has been sent. */
  dirty: boolean
  /** The server revision this device last saw. */
  revision: number
  /** When a sync last completed, for the line under the setting. */
  lastSyncedAt: number
  /**
   * Whether this device has settled its first exchange with the account.
   *
   * The one moment sync cannot decide by itself: a device joining an account
   * that has already synchronized a board, while holding a board of its own.
   * Both cannot be kept. Until this is true the usual rule is suspended and the
   * setting asks — see `useSync`.
   */
  joined: boolean
}

export const emptySync = (): SyncConfig => ({
  enabled: false,
  passphrase: '',
  device: newDeviceId(),
  updatedAt: 0,
  dirty: false,
  revision: 0,
  lastSyncedAt: 0,
  joined: false,
})

export function loadSync(): SyncConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(SYNC_KEY)) ?? 'null')
    if (!stored || typeof stored !== 'object') return emptySync()
    // Field by field over the defaults: a half-written record must not leave the
    // app with a passphrase and no device, which would write a board to an
    // address nothing else can find.
    const base = emptySync()
    return {
      enabled: stored.enabled === true,
      passphrase: typeof stored.passphrase === 'string' ? stored.passphrase : base.passphrase,
      device: typeof stored.device === 'string' && stored.device ? stored.device : base.device,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : 0,
      dirty: stored.dirty === true,
      revision: typeof stored.revision === 'number' ? stored.revision : 0,
      lastSyncedAt: typeof stored.lastSyncedAt === 'number' ? stored.lastSyncedAt : 0,
      joined: stored.joined === true,
    }
  } catch {
    return emptySync()
  }
}

export function saveSync(config: SyncConfig) {
  writeKey(storageKey(SYNC_KEY), JSON.stringify(config))
}
