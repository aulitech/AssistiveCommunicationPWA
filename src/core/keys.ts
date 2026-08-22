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
// Pure data and pure functions, so the layout can be reasoned about — and
// tested — without rendering ninety dwell targets.

/**
 * English letters by how often they are written, commonest first.
 *
 * The apostrophe is in here by usefulness rather than by count: it is rarer
 * than most letters and it carries "I'm", "don't", "it's" and "that's", which
 * is most of what anybody says out loud.
 */
export const BY_FREQUENCY = [
  'e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'd', 'l', 'c', 'u',
  'm', 'w', 'f', 'g', 'y', "'", 'p', 'b', 'v', 'k', 'j', 'x', 'q', 'z',
]

export const ROWS = 3
export const COLUMNS = 9

/**
 * Where each key goes: **commonest nearest the middle**.
 *
 * A gaze pointer pays for distance in a way a finger does not — every letter is
 * a journey from the last one — so the letters that come up most sit where the
 * least travel reaches them, and the ones nobody types are pushed to the
 * corners. It costs familiarity, which is the whole trade: no other keyboard in
 * the world is laid out this way, so every letter has to be found by eye until
 * it is learnt.
 *
 * Ties are broken towards the middle row and then towards the left, so the
 * arrangement is a single fixed answer rather than one of several. **Keys never
 * move afterwards** — a layout that reordered itself around what somebody had
 * just typed would make every letter a fresh search.
 */
export function frequencyLayout(keys: string[] = BY_FREQUENCY): string[][] {
  const middle = (ROWS - 1) / 2
  const centre = (COLUMNS - 1) / 2

  const cells: { row: number; column: number; distance: number }[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      cells.push({ row, column, distance: Math.hypot(row - middle, column - centre) })
    }
  }
  cells.sort(
    (a, b) =>
      a.distance - b.distance ||
      Math.abs(a.row - middle) - Math.abs(b.row - middle) ||
      a.column - b.column,
  )

  const grid: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLUMNS).fill(''))
  keys.slice(0, cells.length).forEach((key, i) => {
    grid[cells[i].row][cells[i].column] = key
  })
  return grid
}

export const LETTER_LAYOUT = frequencyLayout()

/**
 * Digits and punctuation, behind the `?123` key.
 *
 * **Not frequency-ordered**, and deliberately: a number is read and typed as a
 * sequence, so 1 through 9 have to be where anybody would look for them. The
 * argument for scattering letters does not carry over to something that is
 * already an order.
 */
export const SYMBOL_LAYOUT = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  ['0', '.', ',', '?', '!', ':', ';', '"', '-'],
  ['(', ')', '/', '@', '#', '$', '%', '&', '+'],
]

/** What the shift key is doing. One dwell moves it on to the next. */
export type Shift = 'off' | 'once' | 'lock'

export const nextShift = (shift: Shift): Shift =>
  shift === 'off' ? 'once' : shift === 'once' ? 'lock' : 'off'

/** What a letter key types, and what is written on it. */
export const shifted = (key: string, shift: Shift) => (shift === 'off' ? key : key.toUpperCase())

/** What the shift key leaves behind once a key has been typed. */
export const afterTyping = (shift: Shift): Shift => (shift === 'once' ? 'off' : shift)
