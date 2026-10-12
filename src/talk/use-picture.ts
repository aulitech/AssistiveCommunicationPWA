// The picture behind the presentation window, as this board holds it: chosen
// in Settings, named in what synchronizing sends, and carried to and from the
// server while it is on — see `sync/picture.ts` and
// docs/decisions/presentation-mode.md.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadPictureRecord,
  loadPresentationBackground,
  pictureBytes,
  pictureId,
  replacing,
  savePictureRecord,
  savePresentationBackground,
} from '../core/store'
import { type PictureState } from '../core/sync'
import { MAX_CLIP_BYTES, type ClipStore } from '../sync/audio'
import { carryPicture } from '../sync/picture'

/** How often what is owed the server is tried again, as the board's own slow beat. */
const CARRY_MS = 60_000

const named = (): PictureState => {
  const { id, at } = loadPictureRecord()
  return { id, at }
}

export function usePicture() {
  const [picture, setPicture] = useState(loadPresentationBackground)
  const [state, setState] = useState(named)

  /** A picture chosen here, or none for empty — and whether it could be kept. */
  const choose = useCallback(async (url: string): Promise<boolean> => {
    const id = url ? await pictureId(url) : ''
    if (!savePresentationBackground(url)) return false
    const at = Date.now()
    savePictureRecord(replacing(loadPictureRecord(), { id, at, sent: !id }))
    setPicture(url)
    setState({ id, at })
    return true
  }, [])

  /**
   * The picture a board from another device names. Taken away at once where it
   * says none; otherwise the picture itself follows, by `useCarriedPicture`,
   * and the one here stays up until it does.
   */
  const arrive = useCallback((id: string, at: number) => {
    const mine = loadPictureRecord()
    if (mine.id === id && mine.at === at) return
    savePictureRecord(replacing(mine, { id, at, sent: true }))
    setState({ id, at })
    if (id) return
    savePresentationBackground('')
    setPicture('')
  }, [])

  // A picture chosen before pictures travelled has no name yet. Named as having
  // been chosen at the beginning of time, so any choice made since stands over
  // it — and left alone if it is too large to go up at all.
  useEffect(() => {
    const held = loadPresentationBackground()
    const record = loadPictureRecord()
    if (!held || record.id || record.at || pictureBytes(held).bytes.length > MAX_CLIP_BYTES) return
    let current = true
    void pictureId(held).then(id => {
      const now = loadPictureRecord()
      if (!current || now.id || now.at) return
      savePictureRecord({ id, at: 0, sent: false, gone: [] })
      setState({ id, at: 0 })
    })
    return () => {
      current = false
    }
  }, [])

  return { picture, setPicture, state, choose, arrive }
}

/**
 * Carries the picture to and from the server while synchronizing is running:
 * whenever which picture changes, and on a slow beat behind that for whatever
 * could not be done the first time.
 */
export function useCarriedPicture(
  clips: ClipStore | null,
  { picture, state, setPicture }: Pick<ReturnType<typeof usePicture>, 'picture' | 'state' | 'setPicture'>,
) {
  const busy = useRef(false)
  /** A run asked for while the last was still out, run once it is back rather than left for the slow beat. */
  const waiting = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!clips) return
    let current = true
    const run = () => {
      if (busy.current) return void (waiting.current = run)
      busy.current = true
      void carryPicture(clips).then(url => {
        busy.current = false
        if (current && url) setPicture(url)
        const next = waiting.current
        waiting.current = null
        next?.()
      })
    }
    run()
    const timer = setInterval(run, CARRY_MS)
    return () => {
      current = false
      clearInterval(timer)
      if (waiting.current === run) waiting.current = null
    }
  }, [clips, state.id, state.at, picture, setPicture])
}
