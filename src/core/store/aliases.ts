// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { type Aliases, type AliasStore, EMPTY_ALIASES } from '../phrases'
import { ALIAS_SORT_KEY, ALIASES_KEY, PROFILE_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── Aliases ──────────────────────────────────────────────────────────────────
// The lists a phrase's slots choose from. The table ships nine of them and two
// arrive empty — `contacts` and `name` — because there is nowhere in the data to
// put a particular person's details. All of them are the user's to change now,
// and only what they changed is stored: a key that is absent follows the table.

/** Anything that is not a list of non-empty strings is not a list. */
function readLists(raw: unknown): Aliases {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Aliases = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const name = key.trim().toLowerCase()
    if (!name) continue
    out[name] = value.filter((w): w is string => typeof w === 'string' && w.trim() !== '').map(w => w.trim())
  }
  return out
}

const readNames = (raw: unknown) =>
  Array.isArray(raw)
    ? [
        ...new Set(
          raw
            .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
            .map(n => n.trim().toLowerCase()),
        ),
      ]
    : []

/**
 * The store, from whatever is on disk.
 *
 * **A bare object of lists is read as one too.** That is the shape this was
 * before a list could be deleted, and it is what a backup written then carries.
 */
export function readAliases(raw: unknown): AliasStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_ALIASES
  const record = raw as Record<string, unknown>
  const looksLikeStore = 'lists' in record || 'hidden' in record
  return looksLikeStore
    ? { lists: readLists(record.lists), hidden: readNames(record.hidden) }
    : { lists: readLists(record), hidden: [] }
}

/**
 * The three name fields and the contact list somebody entered under **My
 * details**, which is what this panel used to be, read as the alias lists they
 * always were behind the scenes. Run once, when there is no alias store yet —
 * losing somebody's contacts to a renamed menu item would be unforgivable.
 */
export function aliasesFromProfile(raw: unknown): AliasStore {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const name = (source.name && typeof source.name === 'object' ? source.name : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const lists: Aliases = {}
  const out = { lists, hidden: [] as string[] }

  const contacts = Array.isArray(source.contacts) ? source.contacts.map(str).filter(Boolean) : []
  if (contacts.length) lists.contacts = contacts

  const given = str(name.given)
  const surname = str(name.surname)
  const nickname = str(name.nickname)
  if (given) lists['name.given'] = [given]
  if (surname) lists['name.surname'] = [surname]
  if (nickname) lists['name.nickname'] = [nickname]
  // A bare {name} read as the fullest form on offer, and still should.
  const full = [given, surname].filter(Boolean).join(' ') || nickname || given
  if (full) lists.name = [full]

  return out
}

export function loadAliases(): AliasStore {
  try {
    const stored = localStorage.getItem(storageKey(ALIASES_KEY))
    if (stored !== null) return readAliases(JSON.parse(stored))
    // Nothing here yet: carry over whatever the old details panel held, once.
    const profile = localStorage.getItem(storageKey(PROFILE_KEY))
    if (profile === null) return EMPTY_ALIASES
    const carried = aliasesFromProfile(JSON.parse(profile))
    saveAliases(carried)
    return carried
  } catch {
    return EMPTY_ALIASES
  }
}

export function saveAliases(a: AliasStore) {
  writeKey(storageKey(ALIASES_KEY), JSON.stringify(a))
}

/**
 * Which arrangement the Aliases panel is showing, exactly as `categorySort`
 * does for the tabs: A–Z, or the order the user put the words in.
 *
 * A view rather than content, which is why it is its own small key and not part
 * of `Aliases` — the *order* is content and travels in a backup as the order of
 * each list; which of the two is being looked at does not.
 */
export function loadAliasSort(): 'custom' | 'alpha' {
  return localStorage.getItem(storageKey(ALIAS_SORT_KEY)) === 'alpha' ? 'alpha' : 'custom'
}

export function saveAliasSort(sort: 'custom' | 'alpha') {
  writeKey(storageKey(ALIAS_SORT_KEY), sort)
}
