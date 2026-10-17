// **How many category tabs fit on one row with More after them** — see
// `talk/filter-bar.tsx`. Arithmetic over widths somebody else measured, so it
// can be read and tested without a browser to lay anything out.

/** The most rows of tabs the bar takes before the rest go behind More. */
const MAX_ROWS = 1
/** `.filter-tabs`'s gap, which the packing below has to agree with. */
const TAB_GAP = 6

/**
 * How many tabs fit in `MAX_ROWS` rows with More after them, or all of them.
 * **Worked out from widths rather than read off the bar**, the tabs packed as
 * a wrapping row packs them: the bar it would read is the one this decides,
 * and reading it back would decide again — so each answer is from the widths
 * alone, and the same widths always give the same one.
 */
export function tabsThatFit(
  widths: number[],
  room: number,
  /** More's width for the first `k` shown — wider where it carries the name of a tab it hides. */
  moreWidth: (k: number) => number,
): number {
  const rows = (items: number[]) => {
    let count = 1
    let x = 0
    for (const w of items) {
      if (x > 0 && x + TAB_GAP + w > room) {
        count++
        x = w
      } else x += (x > 0 ? TAB_GAP : 0) + w
    }
    return count
  }
  if (room <= 0 || rows(widths) <= MAX_ROWS) return widths.length
  for (let k = widths.length - 1; k > 0; k--) {
    if (rows([...widths.slice(0, k), moreWidth(k)]) <= MAX_ROWS) return k
  }
  return 0
}
