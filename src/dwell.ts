// Dwell interaction primitive.
//
// Every control in the app is driven by hover-and-hold. `useDwellControl` owns
// all the ways one can be activated so they cannot fight each other:
//
//  * Hover and hold — the primary path.
//  * Pointer tap — a touch or click shorter than the dwell time still selects,
//    and is suppressed if the dwell already fired during the same hover, so a
//    mouse user who waits and then clicks does not activate twice.
//  * Enter/Space — keyboard and switch access. Dwell alone excludes anyone
//    driving the app without a pointer.
//
// Cancellation when the pointer leaves the window runs through one shared
// listener rather than a pair per control: the grid mounts thousands of cells,
// and `pointerout` fires on every pointer transition between elements.

import { useCallback, useEffect, useRef, useState } from 'react'

type Cancel = () => void

const inFlight = new Set<Cancel>()
let listening = false

function cancelAll() {
  // Copy first — cancelling mutates the set.
  for (const cancel of [...inFlight]) cancel()
}

function onPointerOut(e: PointerEvent) {
  const target = e.relatedTarget
  const leftWindow = !target || !(target instanceof Node) || !document.contains(target)
  if (leftWindow) cancelAll()
}

function subscribe(cancel: Cancel): () => void {
  inFlight.add(cancel)
  if (!listening) {
    window.addEventListener('pointerout', onPointerOut, { passive: true })
    window.addEventListener('blur', cancelAll)
    listening = true
  }
  return () => {
    inFlight.delete(cancel)
  }
}

/** Abort every in-flight dwell — used when a modal or panel takes over. */
export function cancelAllDwells() {
  cancelAll()
}

export interface DwellOptions {
  disabled?: boolean
  /** When set, the action repeats at this interval while the pointer stays. */
  repeatMs?: number
}

export function useDwellControl(durationMs: number, onActivate: () => void, options: DwellOptions = {}) {
  const { disabled = false, repeatMs } = options

  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dwellFiredRef = useRef(false)

  // The running timer reads the latest callback and timings through refs so
  // that a re-render mid-dwell doesn't restart it. Syncing them in an effect
  // rather than during render keeps a discarded render from leaking its values.
  const activateRef = useRef(onActivate)
  const durationRef = useRef(durationMs)
  const disabledRef = useRef(disabled)
  const repeatMsRef = useRef(repeatMs)

  useEffect(() => {
    activateRef.current = onActivate
    durationRef.current = durationMs
    disabledRef.current = disabled
    repeatMsRef.current = repeatMs
  })

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (repeatRef.current) {
      clearInterval(repeatRef.current)
      repeatRef.current = null
    }
    setActive(false)
  }, [])

  const start = useCallback(() => {
    if (disabledRef.current || timerRef.current || repeatRef.current) return
    dwellFiredRef.current = false
    setActive(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      dwellFiredRef.current = true
      const repeat = repeatMsRef.current
      // Repeating controls keep their fill lit for as long as the pointer rests.
      if (!repeat) setActive(false)
      activateRef.current()
      if (repeat) repeatRef.current = setInterval(() => activateRef.current(), repeat)
    }, durationRef.current)
  }, [])

  const onPointerLeave = useCallback(() => {
    cancel()
    dwellFiredRef.current = false
  }, [cancel])

  const onClick = useCallback(() => {
    // The dwell already handled this hover; don't count the click as a second hit.
    if (disabledRef.current || dwellFiredRef.current) return
    cancel()
    activateRef.current()
  }, [cancel])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabledRef.current || (e.key !== 'Enter' && e.key !== ' ')) return
      // Space would otherwise scroll the grid out from under the user.
      e.preventDefault()
      cancel()
      activateRef.current()
    },
    [cancel],
  )

  useEffect(() => subscribe(cancel), [cancel])
  useEffect(() => cancel, [cancel])

  /** Spread onto the control's element. */
  const props = {
    tabIndex: disabled ? -1 : 0,
    onPointerEnter: disabled ? undefined : start,
    onPointerLeave,
    onClick,
    onKeyDown,
    'aria-disabled': disabled || undefined,
  } as const

  return { active, start, cancel, props }
}
