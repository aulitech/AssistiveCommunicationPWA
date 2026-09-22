// The apologies the board has ready, kept full in the background — see
// `listen/apology.ts` for what they are for.
//
// **The filling is the whole point.** What this covers is a wait, so asking for
// one while somebody is waiting would be a second wait behind the first: five
// are kept ready, and the one that gets said was written long before anybody
// needed it.
//
// **Topped up after one is said, and at no other time.** A board that never
// waits on an answer never asks for any, and the first apology it ever says is
// one of the shipped ones — which is what they are for. Everything after that
// is written for this board, five at a time.

import { useCallback, useEffect, useRef } from 'react'
import { APOLOGY_CACHE, moreApologies, nextApology } from '../listen/apology'
import { loadApologies, saveApologies } from '../core/store'

/** How long to leave a board alone after a fill came back with nothing. */
const RETRY_AFTER_MS = 10 * 60_000

export function useApologies(language: string) {
  /** One fill at a time, and none at all once the screen has gone. */
  const filling = useRef(false)
  /**
   * When a fill last came back with nothing, so a board with no network — or a
   * key that has stopped working — asks once rather than once a question. The
   * shipped apologies cover the whole of the wait either way.
   */
  const emptyHandedAt = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Read back from storage rather than held in state, for the reason the Sent
   * list is: two apologies can be said without a render in between, and the
   * second would be written against a cache that no longer exists.
   */
  const fill = useCallback(() => {
    if (filling.current || Date.now() - emptyHandedAt.current < RETRY_AFTER_MS) return
    const cache = loadApologies()
    const want = APOLOGY_CACHE - cache.ready.length
    if (want <= 0) return
    filling.current = true
    void moreApologies(want, language)
      .then(written => {
        if (written.length === 0) emptyHandedAt.current = Date.now()
        if (!mounted.current || written.length === 0) return
        const now = loadApologies()
        // Anything said within the hour is not ready for anything: it would be
        // passed over at the moment of saying it anyway.
        const fresh = written.filter(t => !now.ready.includes(t) && !now.said.some(s => s.text === t))
        saveApologies({ ...now, ready: [...now.ready, ...fresh].slice(0, APOLOGY_CACHE) })
      })
      .finally(() => {
        filling.current = false
      })
  }, [language])

  /** The next one to say. Always answers: the shipped ones are behind the written ones. */
  const next = useCallback(() => {
    const { text, cache } = nextApology(loadApologies())
    saveApologies(cache)
    fill()
    return text
  }, [fill])

  return next
}
