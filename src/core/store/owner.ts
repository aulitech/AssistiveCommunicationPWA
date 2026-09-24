// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { writeKey } from './keys'
import { accountId, type User } from './user'

// ── Whose board ──────────────────────────────────────────────────────────────
// **A board belongs to whoever signed in to it**, and nobody else who signs in
// on this device can open it. Everything under the keys in `keys.ts` is somebody's:
// their phrases, their lists, their settings, their keys, what they said. Only
// who is signed in, and who owned the board before there was more than one, are
// the device's own.

/**
 * Who a board belongs to: an account, the device's guest, or null.
 *
 * **Every guest is one guest.** Guests prove nothing about who they are, so the
 * board they share is open to anybody who continues as one, and never to an
 * account. **Null is somebody signed in before accounts were told apart**, who
 * has no id to keep a board under. They go on with the board they had until
 * they sign in again, and nobody signs in as them in the meantime, because
 * signing in as anyone replaces them.
 */
export function ownerOf(user: User | null): string | null {
  if (user?.provider === 'guest') return 'guest'
  return accountId(user)
}

/**
 * Who opened a board here first. They inherit the one on the device from
 * before boards were kept apart, and keep the storage names it had.
 */
const FIRST_OWNER_KEY = 'peri_first_owner'

/**
 * Whose board is open while nobody is signed in, which is nobody's. It holds
 * the one thing the sign-in page keeps — how it is worked — and nothing of any
 * board, so nothing of anybody's is on screen before they have signed in.
 */
export const NOBODY = '@nobody'

/** What this page's storage names carry after them: nothing, or `@owner`. */
let suffix = ''

/**
 * Point every read and write at this person's board. Called once as the page
 * opens, and again at sign-in.
 *
 * **The first owner keeps the names the board already had**, which is how the
 * board from before boards were kept apart goes to them without being moved: a
 * move is several writes and could stop halfway, leaving somebody half a board.
 * They inherit it because they were using it, or else because theirs is the
 * next sign-in. Every later owner has `@owner` after every name, which the first
 * owner can never hold, so nothing they write can land on somebody else's.
 *
 * **Opening a different board needs a fresh page.** What a screen has already
 * read stays in memory, and a request still on its way writes under whichever
 * name is current when it lands. So signing out reloads, and signing in happens
 * on a page nobody's board was ever opened in.
 */
export function openBoardFor(user: User | null) {
  if (!user) {
    suffix = NOBODY
    return
  }
  const owner = ownerOf(user)
  if (!owner) {
    suffix = ''
    return
  }
  let first = localStorage.getItem(FIRST_OWNER_KEY)
  if (first === null) {
    first = owner
    writeKey(FIRST_OWNER_KEY, owner)
  }
  suffix = owner === first ? '' : `@${owner}`
}

/**
 * The name one piece of this person's board is kept under. Anything else that
 * keeps something of theirs asks here as well — the translations they have
 * made, and the database their audio is in.
 */
export function storageKey(name: string): string {
  return name + suffix
}

/**
 * Test seam: the bare names, which is where a page is before it has opened a
 * board. The app never is — the shell opens one before anything reads — but
 * every test that is not about whose board is open reads storage from there.
 */
export function forgetWhoseBoard() {
  suffix = ''
}
