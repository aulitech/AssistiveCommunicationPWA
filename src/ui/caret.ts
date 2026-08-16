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
