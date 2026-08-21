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

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * True while the app is resting. Dwell is the only input this app has, so
 * someone who wants to look at the screen without choosing anything — or simply
 * to look away — has no way to stop it firing. Resting switches every control
 * off at once, and the Rest control itself opts out so there is a way back.
 */
export const RestingContext = createContext(false)

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
    window.addEventListener('pointermove', notePointerMove, { passive: true, capture: true })
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

// ── The pointer that never holds still ─────────────────────────────────────
//
// **Safari sends nothing at all when the pointer leaves for another window.**
// Not `pointerout`, not `pointerleave`, not `pointercancel`, not `blur`;
// `:hover` stays true on the element underneath and `document.hasFocus()` never
// changes. Measured against the macOS Accessibility Keyboard — which floats
// over the page and is deliberately non-activating, so there is no focus change
// to hang anything on — the page went silent for 2.7 seconds, and the dwell
// underneath fired 1.6 seconds into that silence and spoke a phrase nobody had
// chosen. Chrome sends a `pointerout` with a null `relatedTarget` there, which
// is the whole reason this has never shown up on it.
//
// With no event to wait for, the only thing left is the stream itself. A head-
// or eye-tracked pointer is a **continuous** device: it emits a `pointermove`
// every ~33ms for as long as it exists, drifting a pixel or two even while its
// owner holds perfectly still. A mouse is the exact opposite — at rest it emits
// nothing whatsoever.
//
// That difference is the whole of the answer. A pointer that has been streaming
// and then stops dead has left the window. A pointer that was never streaming is
// a mouse being still, and **nothing here touches it** — which is the property
// that matters most, because suppressing a mouse user's dwell would leave them
// with no working control at all.
//
// The signature is deliberately narrow: continuous movement that *goes nowhere*.
// A mouse crossing the screen moves continuously but covers ground; a mouse at
// rest covers no ground but sends nothing. Only a tracker does both at once.

/** No event for this long, from a pointer that streams, means it has gone. */
const STALL_MS = 150
/** A longer gap than this ends a run of movement. */
const STREAM_GAP_MS = 120
/** How much history the signature is read from. */
const STREAM_WINDOW_MS = 1500
/** Moves needed inside that window before anything is claimed. */
const STREAM_MIN_MOVES = 20
/** Average pixels per move, above which the pointer is travelling, not resting. */
const STREAM_MAX_DRIFT = 3
/** How long the classification outlives the last time it was seen. */
const STREAM_MEMORY_MS = 10_000

interface Move {
  t: number
  x: number
  y: number
}

let moves: Move[] = []
let lastMoveAt = 0
let streamingSeenAt = 0

function notePointerMove(e: PointerEvent) {
  const t = Date.now()
  // A gap ends the run: what is being looked for is *uninterrupted* movement.
  if (t - lastMoveAt > STREAM_GAP_MS) moves = []
  lastMoveAt = t
  moves.push({ t, x: e.clientX, y: e.clientY })
  while (moves.length > 0 && t - moves[0].t > STREAM_WINDOW_MS) moves.shift()
  if (moves.length < STREAM_MIN_MOVES) return

  let path = 0
  for (let i = 1; i < moves.length; i++) {
    path += Math.abs(moves[i].x - moves[i - 1].x) + Math.abs(moves[i].y - moves[i - 1].y)
  }
  if (path <= moves.length * STREAM_MAX_DRIFT) streamingSeenAt = t
}

/** Whether the pointer has stopped sending, having lately been one that does not. */
function pointerStalled(): boolean {
  if (streamingSeenAt === 0) return false
  const t = Date.now()
  // Long enough since anything looked like a tracker that this is some other
  // device now. Nothing is claimed about a pointer that has not been watched.
  if (t - streamingSeenAt > STREAM_MEMORY_MS) return false
  return t - lastMoveAt > STALL_MS
}

/** Test seam: the stream is module state, exactly as the settle guard is. */
export function forgetPointerStream() {
  moves = []
  lastMoveAt = 0
  streamingSeenAt = 0
}

/**
 * How long nothing may fire after the screen has moved under the pointer.
 *
 * The same second the menu is deaf for after a panel closes, and for the same
 * reason: **a pointer rests where it last fired.** Whatever arrives underneath
 * it gets a `pointerenter` of its own — that is the browser's doing, not a
 * mistake — and a control that arrives under a pointer already at rest starts
 * dwelling on nobody's instruction.
 */
export const SETTLE_MS = 1000

/** Nothing may arm until this moment. */
let deafUntil = 0

/**
 * Go deaf for a moment, because what is under the pointer is about to change.
 *
 * Called where the screen moves rather than where a control fires: leaving a
 * panel, and changing the text size, which relays out every control on screen
 * around a pointer that has not moved.
 *
 * **It stops controls arming, and leaves a control already being held alone.**
 * That line is where it is on purpose. A control somebody is already resting on
 * is one they are deliberately working — the text-size spinner is exactly that,
 * and cancelling it would mean a hold that stepped the size once and stopped,
 * instead of repeating the way every other repeating control does. What the
 * guard is for is the opposite case: something that *arrives* under a pointer
 * which has not moved, and every one of those goes through `start`.
 *
 * Once the window passes, a pointer still resting on something stays inert
 * until it moves. Arming happens on arrival, and it has already arrived.
 */
export function holdDwells(ms: number = SETTLE_MS) {
  deafUntil = Date.now() + ms
}

/** Test seam: nothing in the app clears the guard early. */
export function releaseDwells() {
  deafUntil = 0
}

export interface DwellOptions {
  disabled?: boolean
  /** When set, the action repeats at this interval while the pointer stays. */
  repeatMs?: number
  /** Stays live while the app is resting. Only the Rest control sets this. */
  ignoresRest?: boolean
}

export function useDwellControl(durationMs: number, onActivate: () => void, options: DwellOptions = {}) {
  const { disabled: disabledByCaller = false, repeatMs, ignoresRest = false } = options
  // Resting disables the control outright rather than only its hover path:
  // tap and Enter/Space go through the same gate, so nothing is left that can
  // fire while the app is meant to be doing nothing.
  const resting = useContext(RestingContext)
  const disabled = disabledByCaller || (resting && !ignoresRest)

  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dwellFiredRef = useRef(false)
  /** Held back because the pointer went quiet. Movement is what lets it go. */
  const stalledRef = useRef(false)

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

  /** The pointer has gone quiet. Hold, and wait to be told it is back. */
  const stall = useCallback(() => {
    stalledRef.current = true
    cancel()
  }, [cancel])

  const start = useCallback(() => {
    if (disabledRef.current || timerRef.current || repeatRef.current) return
    // Deaf: the screen moved under the pointer a moment ago, so whatever it is
    // resting on now is not what it was aimed at.
    if (Date.now() < deafUntil) return
    dwellFiredRef.current = false
    stalledRef.current = false
    setActive(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      // Gone quiet, and it is not the kind of pointer that goes quiet while it
      // is still there. Firing now would activate whatever it happened to be
      // over on its way out of the window.
      if (pointerStalled()) return stall()
      dwellFiredRef.current = true
      const repeat = repeatMsRef.current
      // Repeating controls keep their fill lit for as long as the pointer rests.
      if (!repeat) setActive(false)
      activateRef.current()
      if (repeat) {
        repeatRef.current = setInterval(() => {
          // Checked every tick as well: a repeat left running by a pointer that
          // has gone is the worst version of this, since it does not stop.
          if (pointerStalled()) return stall()
          activateRef.current()
        }, repeat)
      }
    }, durationRef.current)
  }, [stall])

  const onPointerLeave = useCallback(() => {
    cancel()
    dwellFiredRef.current = false
    stalledRef.current = false
  }, [cancel])

  const onPointerMove = useCallback(() => {
    // The only way back. Nothing fires when the pointer returns either — the
    // browser never noticed it leave, so the element is still `:hover` and no
    // `pointerenter` is coming. Movement is the whole of the news.
    if (!stalledRef.current) return
    stalledRef.current = false
    start()
  }, [start])

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
    onPointerMove: disabled ? undefined : onPointerMove,
    onPointerLeave,
    onClick,
    onKeyDown,
    'aria-disabled': disabled || undefined,
  } as const

  return { active, start, cancel, props }
}
