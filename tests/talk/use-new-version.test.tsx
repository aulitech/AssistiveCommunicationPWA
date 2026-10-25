// A newer Peri than this open copy, found by asking for the page fresh and
// comparing the script it names — and offered, never forced. See
// src/talk/use-new-version.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { scriptOf, useNewVersion } from '../../src/talk/use-new-version'

const page = (script: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="${script}"></script></head><body></body></html>`

/** The page as this copy was opened on it: the script it is running. */
function running(script: string) {
  const el = document.createElement('script')
  el.type = 'module'
  el.setAttribute('src', script)
  document.head.appendChild(el)
  return el
}

describe('the script a page names', () => {
  it('is read out of the page, wherever the attribute stands', () => {
    expect(scriptOf(page('/assets/index-abc123.js'))).toBe('/assets/index-abc123.js')
    expect(scriptOf('<script src="/assets/index-x.js" type="module"></script>')).toBe('/assets/index-x.js')
    expect(scriptOf('<html>nothing built here</html>')).toBeNull()
  })
})

describe('a newer Peri', () => {
  let el: HTMLScriptElement
  beforeEach(() => {
    el = running('/assets/index-old.js')
  })
  afterEach(() => {
    el.remove()
    vi.unstubAllGlobals()
  })
  const serving = (script: string) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(page(script)) }))

  it('is offered once the page names another script', async () => {
    serving('/assets/index-new.js')
    const { result } = renderHook(() => useNewVersion(true))
    expect(result.current.offered).toBe(false)
    await act(() => result.current.ask())
    expect(result.current.offered).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/', { cache: 'no-store' })
  })

  it('is not offered while the page names the same one', async () => {
    serving('/assets/index-old.js')
    const { result } = renderHook(() => useNewVersion(true))
    await act(() => result.current.ask())
    expect(result.current.offered).toBe(false)
  })

  // No answer is no news: offline, or a server that fails, offers nothing.
  it('offers nothing when the page cannot be had', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const { result } = renderHook(() => useNewVersion(true))
    await act(() => result.current.ask())
    expect(result.current.offered).toBe(false)
  })

  // Later hides it until a release newer than the one declined.
  it('stays away after Later, until a newer one still', async () => {
    serving('/assets/index-new.js')
    const { result } = renderHook(() => useNewVersion(true))
    await act(() => result.current.ask())
    act(() => result.current.later())
    expect(result.current.offered).toBe(false)

    await act(() => result.current.ask())
    expect(result.current.offered, 'offered again for the release declined').toBe(false)

    serving('/assets/index-newer.js')
    await act(() => result.current.ask())
    expect(result.current.offered).toBe(true)
  })

  // The development server names no built script; asking there would find one
  // every time.
  it('asks nothing on its own unless it is the built app', () => {
    serving('/assets/index-new.js')
    vi.useFakeTimers()
    renderHook(() => useNewVersion(false))
    act(() => void vi.advanceTimersByTime(60 * 60 * 1000))
    expect(fetch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
