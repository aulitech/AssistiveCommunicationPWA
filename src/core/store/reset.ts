// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { EMPTY_ALIASES } from '../phrases'
import { RESETTABLE_KEYS } from './keys'
import { storageKey } from './owner'
import { emptyStore } from './phrase-store'
import { DEFAULT_SETTINGS } from './settings'

// ── Factory reset ────────────────────────────────────────────────────────────

/**
 * Put this person's board back to what it shipped with.
 *
 * **Only theirs.** Anybody else who signs in on this device keeps their board,
 * which is not this person's to take away — and their audio, which the caller
 * clears, is in a database of its own for the same reason.
 *
 * **The signed-in user stays.** Signing out is its own item with its own
 * confirmation, and dropping somebody at the sign-in page is not what they asked
 * for when they asked for their settings back.
 *
 * Storage only — nothing here can reach the React state holding the same values,
 * and a screen still showing phrases that no longer exist is worse than no reset
 * at all. The caller reloads, which is the one way to be sure every module has
 * read the empty shelf rather than most of them.
 */
export function factoryReset() {
  for (const key of RESETTABLE_KEYS) localStorage.removeItem(storageKey(key))
}

/** What the app holds immediately after one, for anything that wants to assert it. */
export const factoryState = () => ({
  store: emptyStore(),
  aliases: EMPTY_ALIASES,
  settings: DEFAULT_SETTINGS,
})
