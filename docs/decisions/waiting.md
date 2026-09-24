# Waiting

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

`BusyIndicator`, fixed in the top corner, for the two things that can keep somebody waiting: an exchange with the sync server (`sync.status === 'working'`) and re-parsing the phrase table after an alias list changes (`board.rebuilding`).

- **It waits 250ms before saying anything.** Both of those are usually over in a few milliseconds, and a spinner that appears for fifty of them is a flicker — which costs more here than anywhere else, because **the pointer is the user's gaze**. Something that catches the eye does not merely distract; it aims. Going *off* is immediate: the delay exists to swallow flickers, not to leave one on screen after the work is done.
- **It is not a control.** No dwell, no target, `pointer-events: none`, and a gaze crossing the corner of the screen finds nothing there. A dwell user has no way to dismiss something that catches one.
- **The rebuild is a transition.** `useTransition` in `use-board.ts`, so the indicator is painted before the parse rather than after it — a synchronous `useMemo` would finish the work before the screen could say it had started.
- **It sits above the panels** (`z-index: 600`), because both things it reports on are started from inside one: Synchronize lives in the settings panel and the rebuild is triggered from Aliases.
