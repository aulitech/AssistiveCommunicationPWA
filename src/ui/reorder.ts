// Picking one thing up and putting it down somewhere else.
//
// Reordering by pointer-drag needs a button held down while the pointer moves,
// which is exactly the gesture a dwell user cannot make. So anything arrangeable
// can also be *lifted*: one dwell picks it up, a second dwell on another drops
// it there. Both routes end in the same call, and the caller writes the whole
// arrangement rather than a step of one.
//
// The category tabs and the emergency bar look nothing alike and arrange by
// identical rules, so the rules are written once here. Each item is named by a
// key — a category is its own name, an emergency phrase is its id — and
// `labelOf` turns that key into something worth saying out loud.

import { useCallback, useState } from 'react'

/**
 * What one arrangeable item needs in order to be picked up and put down.
 * `held` is the item in the air; `heldLabel` is what is currently in the air
 * seen from any *other* item, which is what lets each one say what dropping
 * would do.
 */
export interface ReorderProps {
  held: boolean
  heldLabel: string | null
  /** True while a native drag is in flight, which suspends the dwell. */
  dragging: boolean
  dropTarget: boolean
  onLiftOrDrop: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
  onDrop: () => void
}

export interface Reorder {
  /** The props for one item. Called during render, once per item. */
  propsFor: (key: string) => ReorderProps
  /** Puts down whatever is in the air — for switching the mode off. */
  release: () => void
}

export function useReorder({
  onReorder,
  onLift,
  labelOf = key => key,
}: {
  /** Both routes land here with the whole move: what was picked up, and what it was dropped on. */
  onReorder?: (from: string, to: string) => void
  /** Announced when something is picked up — the styling alone says nothing aloud. */
  onLift?: (label: string) => void
  /** What a key is called. Keys are not always names: an emergency phrase is an id. */
  labelOf?: (key: string) => string
}): Reorder {
  // All three are transient — what is in the pointer's hand this second — so
  // they live here rather than in the store.
  const [held, setHeld] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const release = useCallback(() => setHeld(null), [])

  const liftOrDrop = (key: string) => {
    // Dwelling the item already in hand puts it back where it was, which is the
    // only way out of a lift for someone with no other button to press.
    if (held === null) {
      setHeld(key)
      onLift?.(labelOf(key))
    } else {
      if (held !== key) onReorder?.(held, key)
      setHeld(null)
    }
  }

  const propsFor = (key: string): ReorderProps => ({
    held: held === key,
    heldLabel: held !== null && held !== key ? labelOf(held) : null,
    dragging: dragging !== null,
    dropTarget: dropTarget === key && dragging !== key,
    onLiftOrDrop: () => liftOrDrop(key),
    onDragStart: () => {
      // Starting a drag abandons any dwell-lift, so only one is ever in flight.
      setHeld(null)
      setDragging(key)
    },
    onDragOver: () => setDropTarget(key),
    onDragEnd: () => {
      setDragging(null)
      setDropTarget(null)
    },
    onDrop: () => {
      if (dragging && dragging !== key) onReorder?.(dragging, key)
      setDragging(null)
      setDropTarget(null)
    },
  })

  return { propsFor, release }
}

/**
 * What one arrangeable item should say aloud, given what is in the air. The
 * wording is the whole of the instruction for a dwell user — there is no drag
 * cursor and no tooltip to read — so both surfaces say it the same way, with
 * `noun` naming the kind of thing being moved.
 */
export function reorderLabel(reorder: ReorderProps, label: string, noun: string): string {
  if (reorder.held) return `Holding ${label}. Dwell another ${noun} to drop it there, or here to put it back`
  if (reorder.heldLabel) return `Drop ${reorder.heldLabel} here`
  return `Move ${label}`
}
