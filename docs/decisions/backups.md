# Backups

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

A backup is a **diff against the phrase table, not a copy of it**. The table ships with the app, so a file holds only what the user did — added, reworded, moved, removed, rearranged — plus their details and settings. That is why ids matter: they hash the source text, so an id in a backup still names the same phrase in a later release, and one that names nothing is skipped.

Two things in `core/backup.ts` are deliberate and easy to "fix" by mistake:

- **Merging never removes a phrase.** Deleting a phrase is the one change the app offers no way back from, so a file someone else made cannot make one on your device. Only *replace* applies removals, and `canReplace` refuses it for a file covering a few categories — everything the file said nothing about would go.
- **Imported settings are clamped to `SETTING_LIMITS`.** A dwell time of zero fires every control the instant a pointer crosses it, leaving a gaze user no working control to undo it with — and a `repeatDelayMs` of nought empties a list before it can be read, with the control that would slow it down repeating just as fast. A file does not get to set a value the settings panel could not. `readSettings` builds the object field by field, so a new setting is a compiler error here rather than a silently dropped one.
- **Merging aliases adds and never takes away**, for the reason merging phrases does: a file somebody else made must not be able to delete a word off a list on your device. A list in both keeps this device's words and gains the file's; only *replace* takes the file's wholesale.
- **`emergencyOrder` travels with the Emergency category and is never filtered down.** The other lists in a file are trimmed to the categories in scope; an arrangement trimmed to a few of its own ids is not a smaller arrangement, it is a wrong one. Merging appends what the file arranged behind what this device already had, exactly as `categoryOrder` does, so a file cannot rearrange a bar underneath the person using it.
