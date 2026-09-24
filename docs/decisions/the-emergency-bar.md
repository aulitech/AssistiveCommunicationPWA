# The emergency bar

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

The blue bar is the one surface somebody reaches for without reading it, so which button sits where is theirs to set. **It is not red**, and `--urgent` is not `--danger`: red in this app means destruction — delete a phrase, empty the board, sign out — and a red bar along the bottom said *careful* where it needed to say *here, now*. **Menu → edit mode → the arrows at the end of the bar** turns reordering on; from there it behaves exactly like the category tabs, and both come out of `ui/reorder`.

- **The order is by phrase id, and empty means the order Peri ships.** Ids, so rewording a phrase leaves it exactly where it was put — the whole point of arranging a bar is reaching it without looking. Unlike the categories there is no second arrangement to switch back to: the shipped order is the order they happen to be written in, and nobody is looking for it back.
- **A phrase added later lands at the end.** `orderByIds` ranks the ids it knows and leaves the rest as they came, so adding an emergency phrase does not rewrite an arrangement, and an id naming a deleted phrase is skipped rather than leaving a hole.
- **Reordering is its own mode, separate from the category tabs'.** One flag for both would arm the bar somebody speaks with every time they set about tidying their tabs. Both are modes *within* edit mode, and leaving edit mode disarms both.
- **The add control goes quiet rather than away while reordering.** Adding a phrase mid-reorder would drop whatever is in the air, and moving a control a user has learnt to find is worse than disabling it — so the two tools keep a constant width either way.
