// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { USER_KEY, writeKey } from './keys'

// ── Who is signed in ─────────────────────────────────────────────────────────
// Deliberately not part of a backup: a file that could sign you in as someone
// else is a file that could sign someone else in as you.

export interface User {
  name: string
  email: string
  provider: 'google' | 'apple' | 'facebook' | 'guest'
  avatar?: string
  /**
   * The provider's own id for this person, kept because it is the only thing
   * that means "the same account" on a second device. An email can change and a
   * Facebook account often has none, so neither will do. It was thrown away
   * until synchronizing needed it; a user stored before that has none, which is
   * why `accountId` can answer null.
   */
  sub?: string
}

/**
 * What two devices have to agree on to be the same account, or null where there
 * is nothing to agree on — a guest, or somebody signed in before the id was
 * kept, who has to sign in again for sync to know who they are.
 */
export function accountId(user: User | null): string | null {
  if (!user || user.provider === 'guest') return null
  return user.sub ? `${user.provider}:${user.sub}` : null
}

export function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveUser(u: User) {
  writeKey(USER_KEY, JSON.stringify(u))
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

/**
 * Whether a change to storage made in another tab signs somebody in or out. A
 * `null` key is the whole of storage being cleared, which signs everybody out.
 */
export const changesWhoIsSignedIn = (key: string | null) => key === null || key === USER_KEY
