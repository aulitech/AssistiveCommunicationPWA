// **A newer Peri, offered rather than forced** — a strip saying a new version
// is ready, with Update now and Later. See docs/decisions/updating.md.
//
// Peri updates itself whenever it is opened with a connection: the page is
// asked for fresh, and everything it names carries its own contents in its
// file name. What did not update was a copy already open — an iPad left on the
// board for days ran the release it was opened on. So the open copy asks, now
// and then, whether the page has moved on, and says so; it reloads only when
// somebody chooses to, since a reload in the middle of a sentence would lose it.

import { useCallback, useEffect, useRef, useState } from 'react'
import { holdDwells } from '../ui/dwell'

/** How often an open copy asks, besides when it is looked at again. */
const EVERY_MS = 15 * 60 * 1000
/** The first ask, a little after opening — not in the moment a board is loading. */
const FIRST_MS = 60 * 1000

/**
 * **The script a page was built with** — its name carries a hash of its
 * contents, so it is different in every release and the same otherwise.
 */
export function scriptOf(html: string): string | null {
  return html.match(/<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/)?.[1] ?? null
}

/** The script this copy is running. */
function runningScript(): string | null {
  return document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null
}

/**
 * Whether a newer Peri than this copy is out, and the two answers to it.
 * `enabled` is the built app alone: the development server's page names no
 * built script, and every ask would find one.
 */
export function useNewVersion(enabled: boolean) {
  /** The newer script found, or nothing. */
  const [newer, setNewer] = useState<string | null>(null)
  /** The one somebody said Later to: not offered again, a newer one still is. */
  const [declined, setDeclined] = useState<string | null>(null)

  const asking = useRef(false)
  const ask = useCallback(async () => {
    const running = runningScript()
    if (!running || asking.current || !navigator.onLine) return
    asking.current = true
    try {
      // Fresh, past every cache: the page is the one thing that says which
      // release is out, and a stored copy of it would say the old one.
      const res = await fetch('/', { cache: 'no-store' })
      if (!res.ok) return
      const latest = scriptOf(await res.text())
      if (latest && latest !== running) setNewer(latest)
    } catch {
      // No answer is no news: the copy carries on as it is, and asks again.
    } finally {
      asking.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onLook = () => {
      if (document.visibilityState === 'visible') void ask()
    }
    const first = setTimeout(() => void ask(), FIRST_MS)
    const every = setInterval(() => void ask(), EVERY_MS)
    document.addEventListener('visibilitychange', onLook)
    window.addEventListener('online', onLook)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      document.removeEventListener('visibilitychange', onLook)
      window.removeEventListener('online', onLook)
    }
  }, [enabled, ask])

  const offered = newer !== null && newer !== declined
  // The strip moves the screen down as it comes and up as it goes, under a
  // pointer that may be resting where it last fired.
  useEffect(() => {
    if (offered) holdDwells()
    return () => {
      if (offered) holdDwells()
    }
  }, [offered])

  return {
    offered,
    /** Reloads into the newer release — the page is fetched fresh, as on every opening. */
    update: useCallback(() => window.location.reload(), []),
    /** Not now: hidden until a release newer than this one. */
    later: useCallback(() => setDeclined(newer), [newer]),
    /** For the tests: ask now rather than on the clock. */
    ask,
  }
}
