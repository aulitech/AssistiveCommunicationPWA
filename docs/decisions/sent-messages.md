# Sent messages

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

Every message spoken or copied is kept, newest first, and shown under a **Sent** tab pinned to the left of **All**. Selecting one puts it back in the message box; in edit mode it comes into the box to be *kept* as a real phrase, and the bin *forgets* it.

- **Sent is not a category.** Its filter id is `SENT_FILTER`, which begins with a space so no real category — names are trimmed — can ever collide with it. Both it and All carry `fixed: true` in the `categories` prop, which is how `FilterBar` knows a tab cannot be renamed, dragged or reordered.
- **The list is never in a backup.** It is a record of what somebody actually said, and a backup is a file made to be handed to somebody else. Its own storage key, outside the three things `buildBackup` reads, with a test holding it there.
- **The order on screen is the order the tab was opened in.** The record moves as it always did — `addSent` puts a message said again at the front — and what is drawn holds until somebody looks somewhere else, the same rule the board follows under an order that goes by use. See [Ordering the grid](ordering-the-grid.md).
- **`record` and `forget` read storage back rather than closing over state.** Two sends can happen without a render in between, and the second would otherwise be written against a list that no longer exists.
