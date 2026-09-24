# The phrase grid

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

The grid is the app's heaviest surface — over two thousand cells, at roughly twenty microseconds each to create. Two things keep it usable, and they solve different halves of the problem:

- **`content-visibility: auto`** on `.phrase-cell` lets the browser skip layout and paint for cells scrolled out of view. That is the browser's half.
- **`core/virtual.ts`** limits how many cells React creates at all. Switching back to the whole table — **All** then, **Library** now — cost ~95ms of pure reconciliation before it and ~12ms after.

The window **grows from the top and is never repositioned by arithmetic**. Rows are not a uniform height — a phrase long enough to wrap three times makes its whole row taller, and about one row in five does — so anything that multiplied a row height by an index would put the grid in the wrong place a fifth of the time. Rendering the first *n* in normal flow cannot.

Two properties hold it together, and both have mutation-tested guards:

- **The first render is a screenful, not the table.** Measuring needs something rendered to measure, so `FIRST_WINDOW` is what goes in before anything has been measured; the effect measures on the next tick and takes it from there. It mounted all two thousand-odd cells on the way to windowing them down until this existed — on every load, and in every test that opened the board.
- **Unmeasured still means all of them.** Where nothing can be measured at all — a grid that has not been laid out — it renders everything, which is exactly what it did before any of this existed. A phrase out of reach is worse than a slow grid.
- **It cannot strand a phrase.** `needsMore` asks for more within a screen's height of the bottom, and content shorter than the viewport is always within a screen of its own end. So a window too small keeps growing until the grid is scrollable, however far off the measurement was. `rendered >= total` is the only thing stopping that being an infinite loop — removing it hangs the test suite rather than failing it.
