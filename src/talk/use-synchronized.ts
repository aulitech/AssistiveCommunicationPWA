// The board going to the user's other devices, and what arrives from them.
//
// Out of `talk.tsx`, where it was a hundred lines of a twelve-hundred-line
// screen with nothing to say to the rest of it but three values back: the sync
// control the settings row works, and the linked account with its setter. It
// reads the board, the settings and the reply key, and writes them only when a
// board arrives — in one place, which is here.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyBackup, buildBackup } from '../core/backup'
import {
  accountId,
  loadElevenLabs,
  loadRecent,
  sameAccount,
  saveElevenLabs,
  saveRecent,
  type ElevenLabsAccount,
  type Settings,
  type User,
} from '../core/store'
import { SYNC_EPOCH, keepDeviceSettings, portableSettings, type SyncPayload } from '../core/sync'
import { useSync } from '../sync/use-sync'
import { clearAudioCache, setRemoteClips } from '../voice/audio-cache'
import { REMOTE_PREFIX } from '../voice/elevenlabs'
import { type Board } from './use-board'

export function useSynchronized({
  user,
  board,
  settings,
  update,
  replyKey,
  setReplyKey,
  flashToast,
}: {
  user: User
  board: Board
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** The key behind a suggested reply, which travels beside the board. */
  replyKey: string
  setReplyKey: (next: string) => void
  flashToast: (message: string) => void
}) {
  const { store } = board

  // The board as a backup, which is the document sync ships. **A fixed date**,
  // because `buildBackup` stamps the moment it was called and a stamp that moves
  // every render is a board that looks changed every render — which would push
  // for ever. When it was written down is the snapshot's business, not the
  // document's.
  /**
   * The linked account lives here rather than in the settings row that edits it,
   * for two reasons that arrived together: it is part of what synchronizing
   * sends, and a row holding its own copy would go stale the moment a board
   * arrived from another device carrying a different one.
   */
  const [account, setLinkedAccount] = useState<ElevenLabsAccount | null>(loadElevenLabs)

  /**
   * Written straight through, and `speak` reads it back per utterance, so there
   * is no second copy to keep in step. The cache goes with it: audio fetched on
   * one account's credits is not another's to use, and a voice re-linked may
   * well be a different one under the same name.
   *
   * **Writing the same account again is not a change**, and the guard is here
   * rather than at the one caller that needs it today. A board arriving from
   * another device carries the account whether or not that is what changed, so
   * without this an edit to a phrase on the tablet would empty the phone's audio
   * cache — every clip re-fetched, on the user's own credits, for nothing. It is
   * the sort of cost that never shows up as a bug report.
   */
  const setAccount = useCallback((next: ElevenLabsAccount | null) => {
    if (sameAccount(next, loadElevenLabs())) return
    saveElevenLabs(next)
    clearAudioCache()
    // A remembered voice from the account that has just gone would seed the next
    // new phrase with one that no longer exists.
    if (next === null) {
      const recent = loadRecent()
      if (recent.voice?.startsWith(REMOTE_PREFIX)) saveRecent({ ...recent, voice: undefined })
    }
    setLinkedAccount(next)
  }, [])

  const syncBackup = useMemo(
    () =>
      buildBackup({
        store,
        aliases: board.aliases,
        // Text size and volume are about this screen and this speaker, not about
        // the person — so they are blanked on the way out, which also means
        // turning the text size up is not a change to the board at all. See
        // `portableSettings`.
        settings: portableSettings(settings),
        now: SYNC_EPOCH,
      }),
    [store, board.aliases, settings],
  )

  /** Everything sync carries: the board, and what a backup file may not hold. */
  const syncPayload = useMemo(() => ({ backup: syncBackup, account, replyKey }), [syncBackup, account, replyKey])

  // A board that arrived from another device lands exactly as a restored backup
  // does — in one go, with a line saying where it came from, because a grid that
  // rearranges itself under somebody with no explanation is alarming.
  const applyFromSync = useCallback(
    (incoming: SyncPayload, from: string) => {
      const next = applyBackup(incoming.backup, { store, aliases: board.aliases, settings }, 'replace')
      board.restore(next.store, next.aliases)
      // Everything the person set, and this device's own text size and volume.
      update(keepDeviceSettings(next.settings, settings))
      // The account travels with the board, which is what makes a phrase given
      // an ElevenLabs voice on one device still sound like itself on the next.
      // `setAccount` ignores one that has not changed — see there.
      setAccount(incoming.account)
      // And the key behind a suggested reply, for the same reason: it is what
      // makes the feature work on the second device without forty characters of
      // noise being typed into it by dwell.
      setReplyKey(incoming.replyKey)
      flashToast(`Board updated from your other device (${from})`)
    },
    [board, store, settings, update, flashToast, setAccount, setReplyKey],
  )

  const sync = useSync({
    accountId: accountId(user),
    payload: syncPayload,
    onApply: applyFromSync,
  })

  /**
   * Tells the audio cache where the user's other devices keep their clips.
   *
   * **Here because this is the only place that can see both.** `voice/` and
   * `sync/` sit on the same line of the layering, so neither may import the
   * other, and a clip an ElevenLabs voice is about to be billed for is decided
   * deep inside the first while the address it might already be at is worked out
   * by the second. Null while synchronizing is off, which is where the app
   * ships — and put back to null on the way out, or a signed-out screen would
   * leave a stale set of keys installed in a module.
   */
  useEffect(() => {
    setRemoteClips(sync.clips)
    return () => setRemoteClips(null)
  }, [sync.clips])

  return { sync, account, setAccount }
}
