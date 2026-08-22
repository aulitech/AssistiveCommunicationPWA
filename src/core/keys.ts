// The keys Peri draws, and where they sit.
//
// **Peri has to supply its own keyboard.** Typing was the one thing this app
// outsourced — "whatever keyboard the user already has" — and that held only
// because macOS ships an Accessibility Keyboard which is itself dwell-operable.
// iOS has no equivalent: the software keyboard is raised by a gesture and its
// keys are pressed by taps, and a pointer that only hovers has neither. So a
// board driven by gaze cannot type at all there, on any field, until the app
// draws the keys itself.
//
// **QWERTY**, and the arrangement is not a design decision so much as a
// concession. A frequency layout — commonest letters nearest the middle — is
// genuinely less travel, and travel is what a gaze pointer pays for. It was
// built that way first. What it costs is that no other keyboard in the world is
// laid out like it, so every letter has to be hunted for until it is learnt, on
// a board somebody is trying to hold a conversation with. Familiarity wins.
//
// Pure data, so the shape can be reasoned about — and tested — without
// rendering forty dwell targets.

/**
 * The letters, in the three rows everybody already knows.
 *
 * The apostrophe takes the tenth slot of the middle row rather than living on
 * the symbol layer, where iOS keeps it. It is in "I'm", "don't", "it's" and
 * "that's" — most of what anybody says out loud — and a layer switch either
 * side of it would cost two dwells every time.
 */
export const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

/**
 * Digits and punctuation, behind the `?123` key.
 *
 * **The same three-row shape as the letters**, so switching layers moves
 * nothing: shift and backspace flank the short row in both, and a pointer that
 * has learnt where backspace is finds it in the same place either way.
 */
export const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['.', ',', '?', '!', '*', '+', '='],
]

/** What the shift key is doing. One dwell moves it on to the next. */
export type Shift = 'off' | 'once' | 'lock'

export const nextShift = (shift: Shift): Shift =>
  shift === 'off' ? 'once' : shift === 'once' ? 'lock' : 'off'

/** What a letter key types, and what is written on it. */
export const shifted = (key: string, shift: Shift) => (shift === 'off' ? key : key.toUpperCase())

/** What the shift key leaves behind once a key has been typed. */
export const afterTyping = (shift: Shift): Shift => (shift === 'once' ? 'off' : shift)
