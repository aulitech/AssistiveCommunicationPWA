// Putting the caret where somebody is looking.
//
// A text box is the one control in this app that dwell alone could not drive.
// Hovering can focus it, but the caret only ever moved when something was
// clicked — and a click is the one input a gaze user does not have. So a dwell
// over the text asks the browser which character sits under the pointer and puts
// the caret there. Typing itself comes from whatever keyboard the user already
// has; this is the part no keyboard can supply.
//
// Two APIs answer the question, and the difference between them matters here:
//
//  * `caretPositionFromPoint` is the standard one and the only one that answers
//    about a form control *as* a form control — it hands back the field itself
//    and a character index into its value. Trusted whatever the value looks like.
//  * `caretRangeFromPoint` is the older one, still the only answer in some
//    browsers. It reaches inside the field and answers about the run of text it
//    found there, which is the whole value only while the value is one line. On
//    a phrase written over several lines it would give an offset into one of
//    them and read as an offset into all of them, landing the caret somewhere
//    the user did not look. So it is used only for a single-line value, and
//    declined rather than guessed at otherwise.

import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { useDwellControl } from './dwell'

/**
 * What the two APIs look like *at runtime*, which is not what the type
 * definitions say: those declare both as always present, and an old browser,
 * a private window or jsdom will hand over a document with neither.
 */
interface CaretApi {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

/**
 * Which character of `field` sits at this point on the screen, or null when the
 * browser will not say. Null means the caller should leave the caret alone
 * rather than move it somewhere invented.
 */
export function caretIndexAt(field: HTMLTextAreaElement, x: number, y: number): number | null {
  const doc = document as unknown as CaretApi
  // An offset past the end of the value is an answer about something else.
  const within = (index: number) => (index >= 0 && index <= field.value.length ? index : null)

  try {
    const position = doc.caretPositionFromPoint?.(x, y)
    if (position && (position.offsetNode === field || field.contains(position.offsetNode))) {
      return within(position.offset)
    }

    if (!field.value.includes('\n')) {
      const range = doc.caretRangeFromPoint?.(x, y)
      if (range) return within(range.startOffset)
    }
  } catch {
    // Neither is worth reporting: the caret simply stays where it was.
  }
  return null
}

/**
 * How far the pointer must travel before it counts as aiming somewhere new.
 * A dwell fires once per arrival, so without this the caret could be placed
 * only by leaving the box and coming back — but gaze never holds perfectly
 * still, and re-arming on every pixel of drift would mean it never fired.
 */
export const AIM_TOLERANCE = 12

/**
 * Whether the pointer is now far enough from `from` to count as aiming
 * somewhere new.
 *
 * `from` is **where the current wait began**, never the previous movement. A
 * pointer does not jump: it crosses a phrase as a stream of small steps, and
 * comparing each step against the one before it means no amount of travel ever
 * adds up to a move. That is not a smaller version of the right answer, it is
 * the wrong one — the caller that did it re-armed on nothing at all.
 */
export const movedAway = (from: { x: number; y: number }, x: number, y: number) =>
  Math.abs(from.x - x) > AIM_TOLERANCE || Math.abs(from.y - y) > AIM_TOLERANCE

/**
 * Start the fill on a text box over again.
 *
 * Every other dwell control replays its progress bar by remounting it —
 * `key={active ? 'a' : 'i'}` on a `.dwell-bar` child. A textarea can hold no
 * children, so both boxes paint their fill as a CSS animation on the box
 * itself, and re-arming does not change the class: the cancel and the start
 * land in one render, so React writes nothing to the DOM and the animation
 * carries on from wherever it had got to, promising a firing that is no longer
 * coming. Taking the animation off, reading a layout property so the removal
 * takes effect, and putting it back is what starts it again.
 *
 * jsdom lays nothing out, so nothing tests this.
 */
function restartFill(el: HTMLElement | null) {
  if (!el) return
  el.style.animationName = 'none'
  void el.offsetHeight
  el.style.animationName = ''
}

/**
 * A dwell over a text box that puts the caret where the pointer is.
 *
 * Both boxes in the app need it and need it identically — the message box
 * being written in, and the phrase editor — so the awkward parts are settled
 * once here rather than twice:
 *
 *  * **Two positions, not one.** `aim` is where the pointer is and is what the
 *    caret is placed by; `armedAt` is where the current wait began and is what
 *    the distance is measured from. Comparing each movement against the one
 *    before it never adds up, because a pointer crosses a phrase in three-pixel
 *    steps — the dwell then never re-arms at all.
 *  * **The fill has to be restarted by hand.** See `restartFill`.
 *  * **Only the pointer handlers are returned.** The dwell hook's own
 *    Enter/Space handling belongs on a button, not on a box people type into,
 *    where it would swallow the first space typed.
 *
 * `onPlace` is told the index whenever the caret actually moves. The message
 * box tracks the caret in state — it decides which word the grid filters on —
 * and a caret moved by anything other than the user's own keystrokes would
 * otherwise leave that state behind.
 */
export function useCaretDwell(
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  durationMs: number,
  options: { disabled?: boolean; onPlace?: (index: number) => void } = {},
) {
  const { disabled = false, onPlace } = options
  const aim = useRef({ x: 0, y: 0 })
  const armedAt = useRef({ x: 0, y: 0 })

  // Read through a ref so a caller passing an inline function does not
  // rebuild the handlers on every render.
  const placeRef = useRef(onPlace)
  useEffect(() => {
    placeRef.current = onPlace
  })

  const placeCaret = useCallback(() => {
    const el = fieldRef.current
    if (!el) return
    const index = caretIndexAt(el, aim.current.x, aim.current.y)
    // Focus alone is worth having even where the browser will not say which
    // character was meant — it is the difference between a box that can be
    // typed into and one that cannot.
    el.focus()
    if (index === null) return
    el.setSelectionRange(index, index)
    placeRef.current?.(index)
  }, [fieldRef])

  const { active, start, cancel, props } = useDwellControl(durationMs, placeCaret, { disabled })

  const onPointerEnter = useCallback(
    (e: PointerEvent<HTMLTextAreaElement>) => {
      const at = { x: e.clientX, y: e.clientY }
      aim.current = at
      armedAt.current = at
      start()
    },
    [start],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLTextAreaElement>) => {
      const at = { x: e.clientX, y: e.clientY }
      aim.current = at
      if (!movedAway(armedAt.current, at.x, at.y)) return
      // Aiming somewhere new starts the wait again, so the caret lands where
      // the pointer settled rather than where it first arrived.
      armedAt.current = at
      restartFill(fieldRef.current)
      cancel()
      start()
    },
    [cancel, start, fieldRef],
  )

  return { active, props: { onPointerEnter, onPointerMove, onPointerLeave: props.onPointerLeave } }
}
