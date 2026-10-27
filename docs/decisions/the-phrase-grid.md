# The phrase grid

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

The grid is the app's heaviest surface — over two thousand cells, at roughly twenty microseconds each to create. Two things keep it usable, and they solve different halves of the problem:

- **`content-visibility: auto`** on `.phrase-cell` lets the browser skip layout and paint for cells scrolled out of view. That is the browser's half. **Not on an iPad or iPhone**, where Safari lost the phrase under the pointer to it as it was magnified — the first few in a tab, every one from the home screen — so there the window below does the whole job.
- **`core/virtual.ts`** limits how many cells React creates at all. Switching back to the whole table — **All** then, **Library** now — cost ~95ms of pure reconciliation before it and ~12ms after.

The window **grows from the top and is never repositioned by arithmetic**. Rows are not a uniform height — a phrase long enough to wrap three times makes its whole row taller, and about one row in five does — so anything that multiplied a row height by an index would put the grid in the wrong place a fifth of the time. Rendering the first *n* in normal flow cannot.

Two properties hold it together, and both have mutation-tested guards:

- **The first render is a screenful, not the table.** Measuring needs something rendered to measure, so `FIRST_WINDOW` is what goes in before anything has been measured; the effect measures on the next tick and takes it from there. It mounted all two thousand-odd cells on the way to windowing them down until this existed — on every load, and in every test that opened the board.
- **Unmeasured still means all of them.** Where nothing can be measured at all — a grid that has not been laid out — it renders everything, which is exactly what it did before any of this existed. A phrase out of reach is worse than a slow grid.
- **It cannot strand a phrase.** `needsMore` asks for more within a screen's height of the bottom, and content shorter than the viewport is always within a screen of its own end. So a window too small keeps growing until the grid is scrollable, however far off the measurement was. `rendered >= total` is the only thing stopping that being an infinite loop — removing it hangs the test suite rather than failing it.

## The magnified cell

**A cell holds one line of words, no wider than 15rem**, cut off with an ellipsis past that — or past the cell, where the cell is the narrower. **The cell under the pointer is magnified**, as the Dock magnifies what is under it: larger words, the whole of the phrase in lines up to 30rem, drawn over the cells around it. Every cell the same height reads as a grid, and the phrase being looked at is the one read in full.

- **Grown out of its place, which it keeps.** Each cell sits in a `.phrase-place` in the grid, held at its height to the fraction of a pixel while the cell is drawn out of it — so nothing else on the board moves. A row a pixel taller moves every row under it, which is what `offsetHeight`'s rounding did.
- **A frame after the pointer arrives**, never in the same event. Every control asks, as the pointer enters it, whether it came to the pointer rather than the pointer to it (`cameToPointer` in `ui/dwell.ts`); a cell grown before it was asked would cover where the pointer had just been.
- **Kept inside the grid's edges**, pushed in where it would run off one — a cell in the first column grows rightwards.
- **Skipping what is off screen stays on the cell**, not on its place. Skipping clips to the box it is on, which would cut a magnified cell off at its place; and on the place it changed the size the browser guesses for a row it has not laid out, so a new phrase at the end of Library was scrolled to short of where it was.
- **Not for touch**, where nothing hovers, and **not while cells are being arranged**, where a cell is a thing to pick up.
- **Anything that moves the board puts it back** — a new list, a scroll, or the board pushed down by the message box growing round what was just said. The cell goes with its place and would stand grown over somewhere the pointer no longer is, covering the cell that came to the pointer instead; the next movement decides. `e2e/click-through.spec.ts` found it.

