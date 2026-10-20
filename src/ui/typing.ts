// Typing into whatever field has the caret.
//
// The keyboard Peri draws is an *input device*, not a component wired into each
// box. It writes through the DOM the way a real keyboard does and lets React
// hear about it, which is what keeps it from having to know anything about the
// message box, the Aliases panel's fields, a category name or a passphrase —
// every one of which is unusable on a device that cannot tap.
//
// **The value has to be set through the prototype's own setter.** React tracks
// the last value it wrote on the node, and an assignment to `field.value` slips
// past that tracker: the `input` event fires, React compares against what it
// believes is there, finds no change, and drops the event. The letter is on
// screen and gone at the next render. Going through the descriptor is what makes
// the change visible to React, and it is why this cannot be four lines.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

export type TextField = HTMLInputElement | HTMLTextAreaElement

/** The `type`s of `<input>` somebody types words into. */
const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', ''])

export function isTextField(el: Element | EventTarget | null): el is TextField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled
  return false
}

function writeValue(field: TextField, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  // The fallback is for a runtime that will not hand the descriptor over. It is
  // worse — React may not hear it — but a letter that appears is better than a
  // key that does nothing.
  if (setter) setter.call(field, value)
  else field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Where the caret is, or the end of the value where the field will not say. */
function selection(field: TextField): [number, number] {
  const from = field.selectionStart ?? field.value.length
  const to = field.selectionEnd ?? from
  return from <= to ? [from, to] : [to, from]
}

/**
 * Replace whatever is selected with `text`, and leave the caret after it.
 *
 * The selection is what a hold over a field builds up — see `useCaretDwell` —
 * so typing over a selected word replaces it, exactly as a real keyboard does.
 */
export function insertText(field: TextField, text: string) {
  const [from, to] = selection(field)
  writeValue(field, field.value.slice(0, from) + text + field.value.slice(to))
  const caret = from + text.length
  field.setSelectionRange(caret, caret)
}

/**
 * Take back the selection, or the character before the caret.
 *
 * Answers whether it removed anything, so a repeat can stop at the start of the
 * value rather than going on firing at nothing.
 */
export function deleteBack(field: TextField): boolean {
  const [from, to] = selection(field)
  if (from !== to) {
    writeValue(field, field.value.slice(0, from) + field.value.slice(to))
    field.setSelectionRange(from, from)
    return true
  }
  if (from === 0) return false
  writeValue(field, field.value.slice(0, from - 1) + field.value.slice(from))
  field.setSelectionRange(from - 1, from - 1)
  return true
}

/**
 * The field to type into: the focused one, or the last one that was.
 *
 * The fallback is what makes the keyboard usable at all. A key is a dwell
 * control and a dwell control is focusable, so anything that moves focus — a
 * tap from somebody who can tap, a switch, a stray Tab — would otherwise leave
 * the next letter with nowhere to go. The keys refuse focus on the way down as
 * well; this is the belt to that pair of braces.
 */
export function useFocusedField() {
  const last = useRef<TextField | null>(null)

  useEffect(() => {
    const remember = (e: FocusEvent) => {
      if (isTextField(e.target)) last.current = e.target
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  return useCallback(() => {
    if (isTextField(document.activeElement)) return document.activeElement
    // Still in the document? A field that has been unmounted — a panel closed
    // behind the keyboard — is not somewhere to put a letter.
    const remembered = last.current
    if (remembered && document.contains(remembered) && isTextField(remembered)) return remembered
    return null
  }, [])
}

// ── Taking the caret back ────────────────────────────────────────────────────

/** What last pressed on the screen — a mouse, a pen, a finger — or nothing yet. */
let lastPressedBy: string | null = null
/** Whether Peri's own keyboard is on, which types into whatever has the caret. */
let ownKeyboard = false

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    e => {
      lastPressedBy = e.pointerType
    },
    { capture: true, passive: true },
  )
}

/** Set by the screen as the Peri's keyboard setting is. */
export function setOwnKeyboard(on: boolean) {
  ownKeyboard = on
}

/** Test seam: nothing pressed yet. */
export function forgetLastPress() {
  lastPressedBy = null
}

/**
 * **Whether the app may put the caret in a box on its own** — after a phrase
 * is chosen, auto-speak says one, an answer is taken or a paste lands, and
 * whenever focus falls to nothing. Not after a finger, with Peri's own keyboard
 * off: a box taking focus from a tap is what raises a phone's keyboard, and on
 * Android it came up after every tap on the board, over half the screen. The
 * words and where the caret goes are kept all the same; the caret goes in when
 * somebody taps the box. A mouse, a head mouse or a gaze rig raises no keyboard
 * and keeps the caret where typing lands, and so does Peri's own keyboard,
 * which types into whatever has it. Nothing pressed yet, a screen whose main
 * pointer is a finger counts as one.
 */
export function mayTakeCaret(): boolean {
  if (ownKeyboard) return true
  const finger =
    lastPressedBy !== null
      ? lastPressedBy === 'touch'
      : typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return !finger
}

// ── The system keyboard ──────────────────────────────────────────────────────

/** Whether somebody has asked to type into the message or the question box. */
let systemKeyboard = false
const systemKeyboardListeners = new Set<() => void>()

/**
 * **A phone's or a browser's own keyboard comes up only when it is asked for**
 * — a click, a tap or a dwell in the message or the question box — and goes
 * down again at a press or a dwell anywhere else. Until then both boxes say
 * they want none (`inputMode="none"`), and they keep their caret all the same,
 * so a hardware keyboard and Peri's own still type into them. Peri puts the
 * caret in a box on its own often — after a phrase, after a paste, whenever
 * focus falls to nothing — and each of those was half a screen of keyboard
 * nobody asked for.
 */
export function wantSystemKeyboard(on: boolean) {
  if (systemKeyboard === on) return
  systemKeyboard = on
  for (const listener of [...systemKeyboardListeners]) listener()
}

export function useSystemKeyboardWanted(): boolean {
  return useSyncExternalStore(
    listener => {
      systemKeyboardListeners.add(listener)
      return () => systemKeyboardListeners.delete(listener)
    },
    () => systemKeyboard,
  )
}

/** While the app rests, no system keyboard however it is asked for — see `Topbar`. */
let keyboardBarred = false
export function barSystemKeyboard(on: boolean) {
  keyboardBarred = on
}

/** The two boxes the system keyboard is asked for in. */
export const ASKS_FOR_KEYBOARD = '.text-display, .heard-text'

/**
 * A press anywhere but in one of the boxes puts the keyboard away. Where it is
 * in one, the box drops its `inputMode="none"` there and then rather than at
 * the next render, so the very tap that asked is the one the browser answers.
 */
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    e => {
      const box = e.target instanceof Element ? e.target.closest(ASKS_FOR_KEYBOARD) : null
      if (box && !keyboardBarred) box.removeAttribute('inputmode')
      wantSystemKeyboard(box !== null)
    },
    { capture: true, passive: true },
  )
}
