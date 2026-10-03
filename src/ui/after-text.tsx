// A control standing **right after the last word in a text box**, as if it were
// the next word — Speak after the message, Ask after the question.
//
// A textarea holds no children, so nothing can be put inside its text. What can
// be done is to find out where its text ends: a copy of the box, laid out
// exactly as the box is and never seen, holds the same words and then an empty
// space the control's width. Where that space lands is where the control goes —
// after the last word on its line, or at the start of the next line when the
// last line has no room for it, which is where a word typed there would go too.
// The box is grown by the copy's height as well as its own, so a control that
// wrapped onto a line of its own is never drawn below the box — the copy is the
// box's sibling, `.after-text-mirror`, which is how whatever sizes the box finds
// it.
//
// **It moves with every letter**, which is the one thing a gaze target here has
// never done, and the hazard is a control arriving under a pointer at rest on
// the words — or going from under one, leaving the words there instead. So each
// time it lands or goes, if the pointer is where it is or was, nothing may be
// chosen until the pointer moves — see `holdIfUnderPointer`.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { holdIfUnderPointer } from './dwell'
import { cx } from './style'

/** The space between the last word and the control, in the box's own pixels. */
const GAP_PX = 6

/** What of the box decides where its lines break, copied onto the copy. */
const METRICS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
] as const

export function AfterText({
  fieldRef,
  value,
  className,
  children,
}: {
  fieldRef: RefObject<HTMLTextAreaElement | null>
  /** The words in the box, which the copy has to hold too. */
  value: string
  className?: string
  /** The control, or nothing — when there are no words, there is nothing after them. */
  children?: React.ReactNode
}) {
  const mirror = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLSpanElement>(null)
  const controlRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const drawn = Boolean(children)

  useLayoutEffect(() => {
    const field = fieldRef.current
    const copy = mirror.current
    const slot = slotRef.current
    if (!field || !copy || !slot) return
    const place = () => {
      const style = getComputedStyle(field)
      for (const metric of METRICS) copy.style[metric] = style[metric]
      copy.style.width = `${field.offsetWidth}px`
      const control = controlRef.current
      slot.style.width = control ? `${control.offsetWidth + GAP_PX}px` : '0px'
      slot.style.height = style.lineHeight
      if (!control) return setAt(null)
      // Centred on the line the space landed on, and kept inside the box when
      // the words have scrolled — a control scrolled out of sight is one the
      // message cannot be sent with.
      const lineHeight = slot.offsetHeight
      const paddingTop = parseFloat(style.paddingTop) || 0
      const paddingBottom = parseFloat(style.paddingBottom) || 0
      const top = slot.offsetTop - field.scrollTop + (lineHeight - control.offsetHeight) / 2
      const lowest = field.clientHeight - paddingBottom - control.offsetHeight
      const next = {
        left: slot.offsetLeft + GAP_PX,
        top: Math.max(Math.min(paddingTop, lowest), Math.min(top, lowest)),
      }
      // **Placed again where it already stands is not arriving.** The box is
      // measured over and over — every resize, every height it settles to — and
      // a fresh position each time would hold the dwells under somebody who
      // had moved onto it on purpose.
      setAt(was => (was && was.left === next.left && was.top === next.top ? was : next))
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(field)
    field.addEventListener('scroll', place)
    return () => {
      watch.disconnect()
      field.removeEventListener('scroll', place)
    }
  }, [fieldRef, value, drawn])

  // Each time it lands, held if it landed under the pointer — and the place it
  // stood kept, for when it goes.
  const stood = useRef<DOMRect | null>(null)
  useLayoutEffect(() => {
    const control = controlRef.current
    if (!at || !control) return
    holdIfUnderPointer(control)
    stood.current = control.getBoundingClientRect()
  }, [at])

  // **Gone from under the pointer is the same hazard the other way round.**
  // Speak goes when the message is emptied and Save when the phrase is saved,
  // and what is left under a pointer resting where it stood is the text box —
  // a rest on which places the caret, and counts as choosing something.
  useLayoutEffect(() => {
    if (drawn || !stood.current) return
    holdIfUnderPointer(stood.current)
    stood.current = null
  }, [drawn])

  return (
    <>
      <div ref={mirror} className="after-text-mirror" aria-hidden="true">
        {value}
        <span ref={slotRef} className="after-text-slot" />
      </div>
      {drawn && (
        <div
          ref={controlRef}
          className={cx('after-text', at && 'is-placed', className)}
          style={at ? { left: at.left, top: at.top } : undefined}
        >
          {children}
        </div>
      )}
    </>
  )
}
