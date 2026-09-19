// Whether something that scrolls has anywhere left to go, and the two moves a
// dwell can make on it.
//
// **Everything that scrolls in this app has to be scrollable by dwell**, because
// a wheel, a trackpad and a scrollbar are all things a gaze user does not have —
// and what scrolls out of reach of the only input somebody has is simply gone.
// So this is the one answer to "is there more above, is there more below", asked
// by every surface that can overflow: the panes built on `ScrollPane`, and the two
// text boxes on the message bar, which a pane cannot wrap because they are
// textareas and scroll themselves.
//
// Its own module rather than a hook exported from `controls.tsx`, for the reason
// `style.ts` and `settle.ts` are: a file mixing components with plain functions
// loses fast refresh for everything importing it.

import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface ScrollEdges {
  /** Something is scrolled off the top. */
  canUp: boolean
  /** Something is scrolled off the bottom. */
  canDown: boolean
  /**
   * Ask again. The element's own scroll and resize are listened to already;
   * this is for a box whose *content* grew without either — a textarea capped
   * at its maximum height gets taller inside without getting taller outside,
   * and nothing fires.
   */
  update: () => void
  nudge: (dy: number) => void
  toTop: () => void
  toBottom: () => void
}

/**
 * `mounted` is for an element that is not always there — the heard box exists
 * only while listen mode is open. The listeners are attached when the hook first
 * runs, and a ref read then is empty; passing whatever says the element is on
 * screen attaches them again once it is.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, mounted: unknown = true): ScrollEdges {
  const [canUp, setCanUp] = useState(false)
  const [canDown, setCanDown] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanUp(el.scrollTop > 0)
    // A pixel's grace, because a fractional scrollHeight rounds one way and the
    // sum of the other two the other, and a control offering to scroll by
    // nothing is a target spent for nothing.
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ref, update, mounted])

  const nudge = useCallback((dy: number) => ref.current?.scrollBy({ top: dy, behavior: 'smooth' }), [ref])
  const toTop = useCallback(() => ref.current?.scrollTo({ top: 0, behavior: 'smooth' }), [ref])
  const toBottom = useCallback(
    () => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }),
    [ref],
  )

  return { canUp, canDown, update, nudge, toTop, toBottom }
}
