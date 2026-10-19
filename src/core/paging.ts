// **Where a page of the grid lands** — the arithmetic behind the two arrows
// over it, kept apart from them so it can be read and tested without a screen.

/** How far a page moves: five sixths of what shows, so a sixth of it is still in sight. */
const PAGE_SHARE = 5 / 6

/**
 * **Where a page lands**, never splitting the top row: five sixths of the
 * view on, and then back to the nearest row whose top is there or nearer — so
 * the row at the top of the new view is whole, and a sixth or more of the old
 * view is still in sight to land the eye on. Rows here are not one height —
 * a phrase that wraps makes its row taller — so where they start is measured,
 * not worked out.
 *
 * A row taller than the page itself would never be passed, so then it moves
 * the page and lets the row be split, rather than not moving at all.
 */
export function pageTarget(from: number, extent: number, rowTops: readonly number[], direction: 1 | -1): number {
  const want = from + direction * extent * PAGE_SHARE
  const landings =
    direction === 1
      ? rowTops.filter(top => top > from + 1 && top <= want)
      : rowTops.filter(top => top < from - 1 && top >= want)
  if (landings.length === 0) return Math.max(0, want)
  return Math.max(0, direction === 1 ? Math.max(...landings) : Math.min(...landings))
}
