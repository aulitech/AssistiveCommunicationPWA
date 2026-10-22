// Whether the screen matches a media query, kept up to date as it changes — a
// window resized, a tablet turned.
//
// **For what a query decides should be mounted at all**, which CSS cannot say.
// A rule that only hides something still mounts it, and what is hidden still
// does its work: the voice controls subscribe to the device's voice list, and a
// hidden grid measures nothing and so renders every one of its cells. Where a
// query only changes how something looks, it belongs in the stylesheet.

import { useEffect, useState } from 'react'

/**
 * **A phone**: no Present, no clipboard or Undo and Redo in the message card,
 * and the tab showing kept to its name. Asked this way round, so a screen
 * nothing can measure is not taken for one.
 */
export const PHONE = '(max-width: 700px)'

/** False until asked, and wherever there is no `matchMedia` to ask. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return
    const read = () => setMatches(list.matches)
    read()
    list.addEventListener('change', read)
    return () => list.removeEventListener('change', read)
  }, [query])
  return matches
}
