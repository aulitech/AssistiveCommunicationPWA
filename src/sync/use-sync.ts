// Keeping two devices the same, while the setting is on.
//
// The shape of it: this device holds a board, the server holds an encrypted copy
// of somebody's newest board, and every so often the two are compared. What
// "every so often" means is the whole of the design, because a gaze user cannot
// press a refresh button and should never have to:
//
//  * **When the app opens**, so a device picked up after a week arrives current.
//  * **A moment after any change**, debounced, so a run of edits is one push
//    rather than twenty.
//  * **When the tab is looked at again**, which is what actually happens on a
//    tablet — the app is never closed, it is switched away from.
//  * **When the network comes back**, and on a slow beat besides, so a device
//    left open in a corner still catches up.
//
// Everything it does is guarded by one rule: **a failure must cost nothing.** No
// throw reaches the app, no half-applied board is ever rendered, and a device
// that cannot reach the server carries on exactly as Peri always has.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deriveSyncKeys, open, seal, syncCode, type SyncKeys } from '../core/crypto'
import { loadSync, saveSync, type SyncConfig } from '../core/store'
import {
  decideSync,
  hasOwnBoard,
  parseSnapshot,
  SYNC_FORMAT,
  SYNC_VERSION,
  type Envelope,
  type Snapshot,
  type SyncPayload,
} from '../core/sync'
import { drop, pull, push, type Slot } from './client'

/** How long after a change before it is sent. Long enough to gather a burst. */
const PUSH_DELAY_MS = 2_000

/** The slow beat, for a device nobody is touching. */
const POLL_MS = 60_000

export type SyncStatus =
  /** The setting is off. */
  | 'off'
  /** No account to synchronize with — a guest, or a sign-in from before. */
  | 'unavailable'
  /** On, but with no passphrase, so there is no address and no key. */
  | 'locked'
  /**
   * Joined to an account that already has a board, while holding one of its own.
   * The one thing sync will not decide by itself.
   */
  | 'choose'
  | 'working'
  | 'synced'
  | 'error'

export interface SyncControl {
  status: SyncStatus
  /** Six characters of the address, for checking two devices agree. */
  code: string
  /**
   * The passphrase itself, so the settings row can show it and copy it.
   *
   * It is wanted on the *other* device, and nobody — including us — can work it
   * out from anything else. A board whose passphrase has been forgotten is a
   * board that cannot be reached, so being able to read it back off the device
   * that has it is the difference between setting up a second device and
   * starting again.
   */
  passphrase: string
  enabled: boolean
  lastSyncedAt: number
  /** Which device wrote what this one is showing, when it was not this one. */
  lastFrom: string | null
  error: string | null
  /** Whether there is an account at all — the setting is inert without one. */
  available: boolean
  enable: (passphrase: string) => void
  disable: () => void
  syncNow: () => void
  /** Only while `status` is 'choose'. Keep this device's board, and publish it. */
  keepMine: () => void
  /** Only while `status` is 'choose'. Take the board the account already has. */
  takeTheirs: () => void
  /** Turn it off here *and* take the copy off the server. */
  forget: () => void
}

export function useSync({
  accountId,
  payload,
  onApply,
}: {
  accountId: string | null
  /**
   * Everything that travels: the board as a backup, and the linked ElevenLabs
   * account, which a backup file deliberately never carries. Must be memoised
   * **and stable** — the backup built with a fixed `now`, or every render would
   * look like a change and this would push for ever.
   */
  payload: SyncPayload
  /** Put what arrived from another device on the screen. */
  onApply: (payload: SyncPayload, from: string) => void
}): SyncControl {
  const [config, setConfigState] = useState<SyncConfig>(loadSync)
  const [status, setStatus] = useState<SyncStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [lastFrom, setLastFrom] = useState<string | null>(null)
  const [keys, setKeys] = useState<SyncKeys | null>(null)

  // Async work reads state through refs. Between a `fetch` going out and its
  // answer coming back the user may have typed a phrase, turned the setting off
  // or signed out, and a closure holding the values from three renders ago would
  // write the wrong thing back.
  const configRef = useRef(config)
  const keysRef = useRef(keys)
  const payloadRef = useRef(payload)
  const applyRef = useRef(onApply)
  const busyRef = useRef(false)
  /** What the account already had, held while the question above is open. */
  const offeredRef = useRef<Slot | null>(null)
  useEffect(() => {
    configRef.current = config
    keysRef.current = keys
    payloadRef.current = payload
    applyRef.current = onApply
  })

  const writeConfig = useCallback((patch: Partial<SyncConfig>) => {
    setConfigState(current => {
      const next = { ...current, ...patch }
      configRef.current = next
      saveSync(next)
      return next
    })
  }, [])

  // ── Keys ───────────────────────────────────────────────────────────────────
  // Derived once per passphrase and account, because deriving is deliberately
  // slow — a third of a second that must not be paid per sync.

  /** What the keys in hand are *for*. Empty means there is nothing to derive. */
  const want =
    config.enabled && config.passphrase !== '' && accountId ? `${accountId}\u0000${config.passphrase}` : ''
  const [keysFor, setKeysFor] = useState('')
  // Adjusted during render rather than in an effect: the keys for a passphrase
  // that has just been changed are the wrong keys, and an effect would leave one
  // render able to write a board to the old address.
  if (keysFor !== want) {
    setKeysFor(want)
    setKeys(null)
  }
  // The ref behind `keys` is put back in step by the effect above, which runs
  // before any timer or listener can fire — so nothing ever syncs with the keys
  // of a passphrase that has just been replaced. Writing it here instead would
  // be a ref written during a render, which React reserves the right to throw
  // away.

  useEffect(() => {
    if (!want || !accountId) return
    // Guards against a second derivation finishing after a third has started.
    let current = true
    deriveSyncKeys(config.passphrase, accountId).then(
      derived => {
        if (!current) return
        keysRef.current = derived
        setKeys(derived)
      },
      () => {
        if (!current) return
        setStatus('error')
        setError('This browser cannot encrypt a board')
      },
    )
    return () => {
      current = false
    }
  }, [want, accountId, config.passphrase])

  // ── Noticing a local change ────────────────────────────────────────────────
  // The board is compared with itself as it was, rather than every edit calling
  // in. One place to be right, and nothing in `use-board` has to know that sync
  // exists at all.
  const serialised = useMemo(() => JSON.stringify(payload), [payload])
  const seenRef = useRef(serialised)
  // Set while a board that arrived from elsewhere is being taken on board. The
  // change it causes is not this device's news, and marking it as such would
  // have two devices pushing the same board back and forth for ever.
  const adoptRef = useRef(false)

  useEffect(() => {
    if (seenRef.current === serialised) return
    seenRef.current = serialised
    if (adoptRef.current) {
      adoptRef.current = false
      return
    }
    writeConfig({ updatedAt: Date.now(), dirty: true })
  }, [serialised, writeConfig])

  // ── The exchange itself ────────────────────────────────────────────────────

  const settle = useCallback(
    (revision: number) => {
      writeConfig({ revision, lastSyncedAt: Date.now() })
      setStatus('synced')
      setError(null)
    },
    [writeConfig],
  )

  const fail = useCallback((message: string) => {
    setStatus('error')
    setError(message)
  }, [])

  /** Take a board that came from somewhere else. */
  const take = useCallback(
    async (envelope: Envelope, revision: number, key: CryptoKey) => {
      const opened = await open(key, { iv: envelope.iv, data: envelope.data })
      if (opened === null) {
        // The lock did not turn. Every reason for that — a wrong passphrase, a
        // truncated blob, a tampered one — is the same reason to the user: this
        // passphrase does not open this board.
        setStatus('locked')
        setError('That passphrase does not open the board already synchronized')
        return
      }
      const snapshot = parseSnapshot(opened)
      if (!snapshot) return fail('The board on the server could not be read')

      adoptRef.current = true
      applyRef.current(
        {
          backup: snapshot.backup,
          // Nothing said about the account is not the same as "no account" —
          // a snapshot from a release before this carried one says nothing, and
          // taking that as an unlink would strip the account off every device.
          account: snapshot.account === undefined ? payloadRef.current.account : snapshot.account,
        },
        snapshot.device,
      )
      setLastFrom(snapshot.device === configRef.current.device ? null : snapshot.device)
      writeConfig({ updatedAt: snapshot.updatedAt, dirty: false, revision, lastSyncedAt: Date.now() })
      setStatus('synced')
      setError(null)
    },
    [fail, writeConfig],
  )

  /** Send this device's board, settling a stale revision if there is one. */
  const send = useCallback(
    async (revision: number, keySet: SyncKeys): Promise<void> => {
      const now = configRef.current.updatedAt || Date.now()
      const snapshot: Snapshot = {
        updatedAt: now,
        device: configRef.current.device,
        backup: payloadRef.current.backup,
        account: payloadRef.current.account,
      }
      const sealed = await seal(keySet.key, snapshot)
      const envelope: Envelope = {
        format: SYNC_FORMAT,
        version: SYNC_VERSION,
        updatedAt: now,
        device: snapshot.device,
        iv: sealed.iv,
        data: sealed.data,
      }

      const result = await push(keySet.address, envelope, revision)
      if (result.status === 'ok') {
        writeConfig({ updatedAt: now, dirty: false, revision: result.revision, lastSyncedAt: Date.now() })
        setStatus('synced')
        setError(null)
        return
      }
      if (result.status === 'error') return fail(result.error)

      // Somebody wrote first. Their board came back with the refusal, so the
      // same rule decides it as decided the first attempt — and this is the only
      // retry there is: a second refusal is left for the next tick rather than
      // spun on, which is how a pair of devices editing at once would sit there
      // pushing at each other.
      const theirs = result.slot.envelope
      if (theirs && theirs.updatedAt > now) return take(theirs, result.slot.revision, keySet.key)
      const again = await push(keySet.address, envelope, result.slot.revision)
      if (again.status === 'ok') {
        writeConfig({ updatedAt: now, dirty: false, revision: again.revision, lastSyncedAt: Date.now() })
        setStatus('synced')
        setError(null)
      } else if (again.status === 'error') fail(again.error)
    },
    [fail, take, writeConfig],
  )

  const tick = useCallback(async () => {
    const keySet = keysRef.current
    if (!keySet || busyRef.current || !configRef.current.enabled) return
    // A question is open and nothing decides it but an answer. Without this the
    // poll would re-ask every minute, and the status would blink through
    // "synchronizing" each time it did.
    if (offeredRef.current) return
    busyRef.current = true
    setStatus('working')
    try {
      const got = await pull(keySet.address)
      if (got.status === 'error') return fail(got.error)

      const slot: Slot = got.slot
      const remote = slot.envelope
      const action = decideSync(
        { updatedAt: configRef.current.updatedAt, dirty: configRef.current.dirty },
        remote && { updatedAt: remote.updatedAt, device: remote.device },
      )

      // The first exchange after the setting is turned on is not the usual
      // question. What the clocks say is worth nothing here: a device joining an
      // account has an `updatedAt` from whenever it last happened to be edited,
      // which may be years after the board it is joining was perfected.
      if (!configRef.current.joined) {
        if (!remote) {
          // Nothing up there: this device publishes, and that is the account's
          // board from now on.
          await send(slot.revision, keySet)
          writeConfig({ joined: true })
        } else if (!hasOwnBoard(payloadRef.current.backup)) {
          // Nothing here worth keeping — Peri as it ships. Take what the account
          // has without troubling anybody about it.
          await take(remote, slot.revision, keySet.key)
          writeConfig({ joined: true })
        } else {
          // Two boards, one account, and no way to tell from here which one
          // somebody means. Ask, and do nothing at all until they answer.
          offeredRef.current = slot
          setStatus('choose')
          setError(null)
        }
        return
      }

      if (action === 'pull' && remote) await take(remote, slot.revision, keySet.key)
      else if (action === 'push') await send(slot.revision, keySet)
      else settle(slot.revision)
    } finally {
      busyRef.current = false
    }
  }, [fail, send, settle, take, writeConfig])

  // ── When to do it ──────────────────────────────────────────────────────────

  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  })

  // On arrival, and whenever the keys change under it.
  useEffect(() => {
    if (keys) void tickRef.current()
  }, [keys])

  // A moment after a change, so a burst of edits is one push.
  useEffect(() => {
    if (!keys || !config.dirty) return
    const timer = setTimeout(() => void tickRef.current(), PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [keys, config.dirty, config.updatedAt])

  // Coming back to the tab, coming back online, and the slow beat behind both.
  useEffect(() => {
    if (!keys) return
    const wake = () => {
      if (document.visibilityState === 'visible') void tickRef.current()
    }
    const timer = setInterval(() => void tickRef.current(), POLL_MS)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [keys])

  // ── What the settings row drives ───────────────────────────────────────────

  const enable = useCallback(
    (passphrase: string) => {
      setError(null)
      offeredRef.current = null
      // **No clock is set here.** Stamping "now" would make every device that
      // has just been switched on the newest board in the world, and the second
      // device to join an account would overwrite the first. Which board wins
      // the first exchange is decided in `tick`, and where it cannot be, asked.
      const next = passphrase.trim()
      writeConfig({
        enabled: true,
        passphrase: next,
        dirty: true,
        // Turning it off and straight back on is not joining anything: this
        // device has already had that conversation, and asking again would put
        // a question in front of somebody who changed nothing.
        joined: configRef.current.joined && configRef.current.passphrase === next,
      })
    },
    [writeConfig],
  )

  const disable = useCallback(() => {
    setError(null)
    setStatus('off')
    // The passphrase stays. Turning it off and on again is a thing people do,
    // and asking for it a second time would mean deriving a second address by
    // mistyping it — which reads as the board having been lost.
    writeConfig({ enabled: false })
  }, [writeConfig])

  const forget = useCallback(() => {
    const address = keysRef.current?.address
    setStatus('off')
    setError(null)
    writeConfig({ enabled: false, passphrase: '', dirty: false, revision: 0, lastSyncedAt: 0 })
    if (address) void drop(address)
  }, [writeConfig])

  const keepMine = useCallback(() => {
    const slot = offeredRef.current
    const keySet = keysRef.current
    if (!slot || !keySet) return
    offeredRef.current = null
    // Now it is the newest board there is, which is what keeping it means.
    writeConfig({ joined: true, dirty: true, updatedAt: Date.now() })
    setStatus('working')
    void send(slot.revision, keySet)
  }, [send, writeConfig])

  const takeTheirs = useCallback(() => {
    const slot = offeredRef.current
    const keySet = keysRef.current
    if (!slot?.envelope || !keySet) return
    offeredRef.current = null
    writeConfig({ joined: true })
    setStatus('working')
    void take(slot.envelope, slot.revision, keySet.key)
  }, [take, writeConfig])

  const syncNow = useCallback(() => void tickRef.current(), [])

  const available = accountId !== null
  const shown: SyncStatus = !config.enabled
    ? 'off'
    : !available
      ? 'unavailable'
      : config.passphrase === ''
        ? 'locked'
        : // Working, rather than whatever the last exchange ended as: with a
          // passphrase set and no keys in hand, the derivation is still running.
          !keys && status !== 'error' && status !== 'locked'
          ? 'working'
          : status

  return useMemo(
    () => ({
      status: shown,
      code: keys ? syncCode(keys.address) : '',
      passphrase: config.passphrase,
      enabled: config.enabled,
      lastSyncedAt: config.lastSyncedAt,
      lastFrom,
      error,
      available,
      enable,
      disable,
      syncNow,
      keepMine,
      takeTheirs,
      forget,
    }),
    [
      shown,
      keys,
      config.passphrase,
      config.enabled,
      config.lastSyncedAt,
      lastFrom,
      error,
      available,
      enable,
      disable,
      syncNow,
      keepMine,
      takeTheirs,
      forget,
    ],
  )
}
