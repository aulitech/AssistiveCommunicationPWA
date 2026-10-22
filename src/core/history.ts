// **What a change did to the board**, written down so it can be taken back and
// done again — the history behind Undo and Redo. See
// docs/decisions/undo-and-redo.md.
//
// A change is kept as the difference it made rather than the board before and
// after it: a board is tens of kilobytes, fifty of them twice over is more than
// a device's storage will hold for one record, and a whole board put back would
// take with it everything that happened since — a message kept, a board arriving
// from another device. **The difference is applied to the board as it stands
// now**, so what came after is left alone wherever it does not touch the same
// phrase.

import type { PhraseStore, StoredPhrase } from './store/phrase-store'
import type { PhraseUse } from './store/records'

/**
 * A list of ids, changed: what went, what came and where, and — only where the
 * ones on both sides were put in another order — the whole order.
 */
export interface IdsDelta {
  removed: string[]
  /** Each id that came, and its place in the list it came into. */
  added: [string, number][]
  order?: string[]
}

/** Going from one board to another. Only what changed is here. */
export interface StoreDelta {
  custom?: { removed: string[]; added: [StoredPhrase, number][]; changed: StoredPhrase[] }
  overrides?: Record<string, string | null>
  voiceOverrides?: Record<string, Record<string, string> | null>
  hidden?: IdsDelta
  /** A category's references changed; `null` is a category gone, a list one made. */
  members?: Record<string, IdsDelta | string[] | null>
  categoryOrder?: IdsDelta
  categorySort?: PhraseStore['categorySort']
  emergencyOrder?: IdsDelta
  libraryOrder?: IdsDelta
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function diffIds(from: string[], to: string[]): IdsDelta | undefined {
  const was = new Set(from)
  const now = new Set(to)
  const removed = from.filter(id => !now.has(id))
  const added = to.flatMap((id, at) => (was.has(id) ? [] : [[id, at] as [string, number]]))
  const moved = !same(
    from.filter(id => now.has(id)),
    to.filter(id => was.has(id)),
  )
  if (!removed.length && !added.length && !moved) return undefined
  return { removed, added, ...(moved && { order: to }) }
}

function applyIds(list: string[], d: IdsDelta): string[] {
  const gone = new Set(d.removed)
  let next = list.filter(id => !gone.has(id))
  if (d.order) {
    const ordered = d.order.filter(id => !gone.has(id))
    return [...ordered, ...next.filter(id => !ordered.includes(id))]
  }
  for (const [id, at] of [...d.added].sort((a, b) => a[1] - b[1])) {
    if (!next.includes(id)) next = [...next.slice(0, at), id, ...next.slice(at)]
  }
  return next
}

function diffRecord<T>(from: Record<string, T>, to: Record<string, T>): Record<string, T | null> | undefined {
  const out: Record<string, T | null> = {}
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!(key in to)) out[key] = null
    else if (!same(from[key], to[key])) out[key] = to[key]
  }
  return Object.keys(out).length ? out : undefined
}

function applyRecord<T>(record: Record<string, T>, d: Record<string, T | null>): Record<string, T> {
  const next = { ...record }
  for (const [key, value] of Object.entries(d)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next
}

/** What it takes to go from `from` to `to`. */
export function diffStore(from: PhraseStore, to: PhraseStore): StoreDelta {
  const d: StoreDelta = {}

  const fromIds = new Map(from.custom.map(p => [p.id, p]))
  const toIds = new Map(to.custom.map(p => [p.id, p]))
  const custom = {
    removed: from.custom.filter(p => !toIds.has(p.id)).map(p => p.id),
    added: to.custom.flatMap((p, at) => (fromIds.has(p.id) ? [] : [[p, at] as [StoredPhrase, number]])),
    changed: to.custom.filter(p => fromIds.has(p.id) && !same(fromIds.get(p.id), p)),
  }
  if (custom.removed.length || custom.added.length || custom.changed.length) d.custom = custom

  const overrides = diffRecord(from.overrides, to.overrides)
  if (overrides) d.overrides = overrides
  const voiceOverrides = diffRecord(from.voiceOverrides, to.voiceOverrides)
  if (voiceOverrides) d.voiceOverrides = voiceOverrides
  const hidden = diffIds(from.hidden, to.hidden)
  if (hidden) d.hidden = hidden

  const members: Record<string, IdsDelta | string[] | null> = {}
  for (const category of new Set([...Object.keys(from.members), ...Object.keys(to.members)])) {
    if (!(category in to.members)) members[category] = null
    else if (!(category in from.members)) members[category] = to.members[category]
    else {
      const ids = diffIds(from.members[category], to.members[category])
      if (ids) members[category] = ids
    }
  }
  if (Object.keys(members).length) d.members = members

  for (const key of ['categoryOrder', 'emergencyOrder', 'libraryOrder'] as const) {
    const ids = diffIds(from[key], to[key])
    if (ids) d[key] = ids
  }
  if (from.categorySort !== to.categorySort) d.categorySort = to.categorySort
  return d
}

/** Whether a difference changes nothing. */
export const isEmptyDelta = (d: StoreDelta) => Object.keys(d).length === 0

/**
 * **`d` applied to the board as it stands** — which is the board it was taken
 * against, unless something happened since. What came since is kept: a phrase
 * goes back to where it was among the ones there now, and an id the board no
 * longer holds is simply not there to move.
 */
export function applyDelta(store: PhraseStore, d: StoreDelta): PhraseStore {
  const next = { ...store }
  if (d.custom) {
    const gone = new Set(d.custom.removed)
    const changed = new Map(d.custom.changed.map(p => [p.id, p]))
    let custom = store.custom.filter(p => !gone.has(p.id)).map(p => changed.get(p.id) ?? p)
    for (const [p, at] of [...d.custom.added].sort((a, b) => a[1] - b[1])) {
      if (!custom.some(c => c.id === p.id)) custom = [...custom.slice(0, at), p, ...custom.slice(at)]
    }
    next.custom = custom
  }
  if (d.overrides) next.overrides = applyRecord(store.overrides, d.overrides)
  if (d.voiceOverrides) next.voiceOverrides = applyRecord(store.voiceOverrides, d.voiceOverrides)
  if (d.hidden) next.hidden = applyIds(store.hidden, d.hidden)
  if (d.members) {
    const members = { ...store.members }
    for (const [category, change] of Object.entries(d.members)) {
      if (change === null) delete members[category]
      else if (Array.isArray(change)) members[category] = [...new Set([...change, ...(members[category] ?? [])])]
      else members[category] = applyIds(members[category] ?? [], change)
    }
    next.members = members
  }
  for (const key of ['categoryOrder', 'emergencyOrder', 'libraryOrder'] as const) {
    const change = d[key]
    if (change) next[key] = applyIds(store[key], change)
  }
  if (d.categorySort) next.categorySort = d.categorySort
  return next
}

/**
 * **One thing done to the board**: a phrase saved, a phrase deleted or taken
 * out of a category, a category deleted — and what it takes to undo it and do
 * it again.
 */
export interface Change {
  /** What was done, in a few words — on the controls and in the toast. */
  what: string
  /** The phrase it was about, opened and pointed at when it is undone or done again. */
  phrase?: string
  /** The tab it was done on, gone back to with it. */
  tab?: string
  forward: StoreDelta
  back: StoreDelta
  /** The count a phrase deleted took with it, put back with the phrase. */
  use?: { id: string; use: PhraseUse }
  /** A hidden tab whose category was deleted, hidden again when it comes back. */
  hiddenTab?: string
}

/** What can be undone, oldest first, and what can be done again, the next last. */
export interface History {
  undo: Change[]
  redo: Change[]
}

/** How many changes are kept to undo. */
export const HISTORY_LIMIT = 50

export const emptyHistory = (): History => ({ undo: [], redo: [] })

/** A change just made: last to undo, and nothing left to do again. */
export const recorded = (history: History, change: Change): History => ({
  undo: [...history.undo, change].slice(-HISTORY_LIMIT),
  redo: [],
})
