// How much of a long grid to actually render.
//
// The phrase grid is up to two and a half thousand cells, and every one costs
// about twenty microseconds to create — fifty milliseconds a keystroke, on the
// path where somebody is typing to narrow it down. Rendering only what is near
// the viewport takes that to nothing.
//
// It windows from the top only: the cells rendered are always the first n, laid
// out in normal flow. Nothing is positioned by arithmetic, which matters because
// the rows are not a uniform height — a phrase long enough to wrap three times
// makes its whole row taller, and about one row in five does. A virtualiser that
// multiplied a row height by an index would put the grid in the wrong place a
// fifth of the time.
//
// The price is that scrolling to the bottom eventually renders everything. That
// is the right trade for a board people filter and search rather than scroll
// end to end, and `needsMore` guarantees it can always be reached.

export interface Viewport {
  /** Height of the scrolling element. Zero where nothing has been laid out. */
  clientHeight: number
  scrollTop: number
  scrollHeight: number
}

export interface GridMetrics {
  /** Cells across, from the grid's own computed columns. */
  columns: number
  /** Height of one row, measured from a rendered cell. */
  rowHeight: number
}

/** Screens' worth of cells to keep rendered ahead of the viewport. */
const OVERSCAN_SCREENS = 4

/**
 * How many cells to render, or **null for all of them** — which is the honest
 * answer whenever the grid has not been laid out and there is nothing to measure
 * from. Rendering everything is what the app did before any of this, so the
 * unmeasured case is never worse than the status quo.
 */
export function windowSize(viewport: Viewport, metrics: GridMetrics): number | null {
  const { clientHeight } = viewport
  const { columns, rowHeight } = metrics
  if (clientHeight <= 0 || rowHeight <= 0 || columns <= 0) return null
  const rows = Math.ceil(clientHeight / rowHeight) * OVERSCAN_SCREENS
  return Math.max(columns, rows * columns)
}

/**
 * Whether to render more: true within a screen's height of the bottom.
 *
 * That margin is also what makes the window self-correcting. Content shorter
 * than the viewport is always within a screen of its own end, so a window too
 * small to fill the screen always asks for more — and keeps asking until the
 * grid is scrollable. However badly the measurement underestimates, no phrase
 * can end up out of reach.
 *
 * The `rendered >= total` line is what stops that being an infinite loop.
 */
export function needsMore(viewport: Viewport, rendered: number, total: number): boolean {
  if (rendered >= total) return false
  const { scrollTop, clientHeight, scrollHeight } = viewport
  return scrollTop + clientHeight >= scrollHeight - clientHeight
}
