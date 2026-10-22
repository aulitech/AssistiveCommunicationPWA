// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.
//
// **The changes Undo and Redo can reach**, kept on this device under the
// account, so a reload does not lose them. In no backup and nothing
// Synchronize sends: it is this device's record of what was done here, and the
// words of what was deleted are in it. See docs/decisions/undo-and-redo.md.

import { emptyHistory, HISTORY_LIMIT, type Change, type History } from '../history'
import { HISTORY_KEY, writeKey } from './keys'
import { storageKey } from './owner'

const isChange = (c: unknown): c is Change => {
  if (typeof c !== 'object' || c === null) return false
  const { what, forward, back } = c as Partial<Change>
  return (
    typeof what === 'string' &&
    typeof forward === 'object' &&
    forward !== null &&
    typeof back === 'object' &&
    back !== null
  )
}

export function loadHistory(): History {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(HISTORY_KEY)) ?? 'null') as Partial<History> | null
    if (!raw || !Array.isArray(raw.undo) || !Array.isArray(raw.redo)) return emptyHistory()
    return { undo: raw.undo.filter(isChange).slice(-HISTORY_LIMIT), redo: raw.redo.filter(isChange) }
  } catch {
    return emptyHistory()
  }
}

export function saveHistory(history: History) {
  writeKey(storageKey(HISTORY_KEY), JSON.stringify(history))
}
