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

/** Either kind of text box: the message box, and the fields in the Aliases panel. */
export type CaretField = HTMLTextAreaElement | HTMLInputElement

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
export function caretIndexAt(field: CaretField, x: number, y: number): number | null {
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
 * The word around `index`, as a range into `value`.
 *
 * What a hold selects before it selects everything. Whitespace is the only
 * boundary — a hyphenated name and an address are each one word, because in a
 * box this size what somebody means to replace is what reads as one thing.
 *
 * A caret that is **not on a word** — on a space, or past the end of the value —
 * takes the word behind it: resting just after "coffee " is aiming at "coffee",
 * there being nothing else it could mean.
 */
export function wordAt(value: string, index: number): [number, number] {
  const isWord = (c: string | undefined) => c !== undefined && !/\s/.test(c)
  let from = Math.max(0, Math.min(index, value.length))
  let to = from
  if (!isWord(value[to])) {
    while (from > 0 && !isWord(value[from - 1])) from -= 1
    to = from
  }
  while (from > 0 && isWord(value[from - 1])) from -= 1
  while (to < value.length && isWord(value[to])) to += 1
  return [from, to]
}

/**
 * How far the pointer must travel before it counts as aiming somewhere new.
 * A dwell fires once per arrival, so without this the caret could be placed
 * only by leaving the box and coming back — but gaze never holds perfectly
 * still, and re-arming on every pixel of drift would mean it never fired.
 */
export const AIM_TOLERANCE = 12

/** The last step of a hold: caret, then word, then everything. */
const LAST_HOLD = 2

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
 *
 * **`selectOnHold` is how a gaze selects text.** Placing a caret is one thing a
 * dwell can say and selecting a range is two, so the second is said by *keeping
 * still*: rest once and the caret lands under the pointer, keep resting and the
 * word around it is taken, keep resting again and the whole value is. Each step
 * replays the fill, so the next one is visibly coming and moving away at any
 * point stops it. No second control anywhere — two targets in one place is the
 * worst thing to hand somebody aiming by gaze, and there is nowhere in a box
 * this size to put one.
 *
 * The message box does not ask for it. A pointer parked over the message while
 * its owner reads the board is at rest without meaning anything by it, and the
 * caret there also decides which word the grid completes. In a field somebody
 * has opened to reword, a rest is intent.
 */
export function useCaretDwell(
  fieldRef: RefObject<CaretField | null>,
  durationMs: number,
  options: { disabled?: boolean; onPlace?: (index: number) => void; selectOnHold?: boolean } = {},
) {
  const { disabled = false, onPlace, selectOnHold = false } = options
  const aim = useRef({ x: 0, y: 0 })
  const armedAt = useRef({ x: 0, y: 0 })
  /**
   * How far the hold has got: 0 puts the caret down, 1 takes the word around it,
   * 2 takes the whole value, and anything beyond is a rest with nothing left to
   * ask for. Reset wherever the wait starts again, so aiming somewhere new is
   * always a caret rather than a continuation of the last hold.
   */
  const step = useRef(0)
  const placedAt = useRef(0)
  // Filled in below: the callback is built before the control that cancels it.
  const cancelRef = useRef<() => void>(() => {})

  // Read through a ref so a caller passing an inline function does not
  // rebuild the handlers on every render.
  const placeRef = useRef(onPlace)
  useEffect(() => {
    placeRef.current = onPlace
  })

  const placeCaret = useCallback(() => {
    const el = fieldRef.current
    if (!el) return
    // Focus alone is worth having even where the browser will not say which
    // character was meant — it is the difference between a box that can be
    // typed into and one that cannot.
    el.focus()

    let next = step.current + 1
    if (step.current === 0) {
      const index = caretIndexAt(el, aim.current.x, aim.current.y)
      // Nothing was placed, so there is nothing to grow a selection out of: the
      // hold stays where it is and the next rest tries again.
      if (index === null) return
      el.setSelectionRange(index, index)
      placedAt.current = index
      placeRef.current?.(index)
    } else if (step.current === 1) {
      const [from, to] = wordAt(el.value, placedAt.current)
      el.setSelectionRange(from, to)
      // A field holding one word is already all of it. There is nothing between
      // the word and everything, so the hold is finished rather than repeating
      // itself with the same selection twice.
      if (from === 0 && to === el.value.length) next = LAST_HOLD + 1
    } else {
      el.setSelectionRange(0, el.value.length)
    }

    if (!selectOnHold) return
    step.current = next
    // A bar that fills promises a firing, so at the end of the hold it has to
    // stop rather than keep filling towards a step that would do nothing.
    if (next > LAST_HOLD) cancelRef.current()
    else restartFill(el)
  }, [fieldRef, selectOnHold])

  const { active, start, cancel, props } = useDwellControl(durationMs, placeCaret, {
    disabled,
    // What turns a rest into a hold. Without it the dwell fires once and the
    // caret is all a gaze can ever say.
    repeatMs: selectOnHold ? durationMs : undefined,
  })

  useEffect(() => {
    cancelRef.current = cancel
  })

  const onPointerEnter = useCallback(
    (e: PointerEvent<CaretField>) => {
      const at = { x: e.clientX, y: e.clientY }
      aim.current = at
      armedAt.current = at
      step.current = 0
      start()
    },
    [start],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<CaretField>) => {
      const at = { x: e.clientX, y: e.clientY }
      aim.current = at
      if (!movedAway(armedAt.current, at.x, at.y)) return
      // Aiming somewhere new starts the wait again, so the caret lands where
      // the pointer settled rather than where it first arrived — and says a
      // caret rather than carrying on the selection the last rest was growing.
      armedAt.current = at
      step.current = 0
      restartFill(fieldRef.current)
      cancel()
      start()
    },
    [cancel, start, fieldRef],
  )

  return { active, props: { onPointerEnter, onPointerMove, onPointerLeave: props.onPointerLeave } }
}
