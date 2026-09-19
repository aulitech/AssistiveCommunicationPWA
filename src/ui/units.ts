// How a quantity is written for somebody to read.
//
// Its own module rather than a function exported from `controls.tsx`, for the
// reason `style.ts` is: a file mixing components with plain functions loses fast
// refresh for everything importing it — and four spinners on two screens need
// this, so it cannot live in either.

/**
 * A time, in seconds, with **none or three figures after the point** and never
 * one or two: `1s`, `2s`, `0.800s`, `1.500s`, `0.050s`.
 *
 * Seconds because every time a person sets in this app is one — a dwell, a
 * repeat — and the auto-repeat row said `1000ms` while the two dwell rows above
 * it said `1.5s`, three rows about the same kind of thing in two units. Three
 * figures because the auto-repeat steps in fifty milliseconds, and one figure
 * would write its `1050` as `1.1s` — a value that spinner cannot hold. Three show
 * every value any of them can reach exactly. None at all on a whole second, where
 * `.000` would be three figures saying nothing.
 */
export function seconds(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${(ms / 1000).toFixed(3)}s`
}
