
// The category tabs above the grid, and the controls that arrange them.
//
// The tabs can be reordered by dragging with a mouse or, for a dwell user, by
// holding one tab and then dwelling where it should go. Both write the same
// whole arrangement.

import { useCallback, useRef, useState } from 'react'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { PlusIcon } from './icons'
import { cx, dwellVar } from './style'

/**
 * Reordering by pointer-drag needs a button held down while the pointer moves,
 * which is exactly the gesture a dwell user cannot make. So a tab can also be
 * *lifted* — one dwell picks it up, a second dwell on another tab drops it
 * there. `held` is the lifted tab; `heldLabel` is what is currently in the air,
 * which every other tab needs in order to say what dropping would do.
 */
interface ReorderProps {
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

function FilterTab({ label, active, onSelect, onEdit, reorder }: {
  label: string
  active: boolean
  onSelect: () => void
  onEdit?: () => void
  /** Present only in reorder mode, and never on "All". */
  reorder?: ReorderProps
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleActivate = useCallback(() => {
    // Reordering takes precedence: while it is on, a tab is a thing to move
    // rather than a thing to rename or select.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    // In edit mode a tab opens for renaming, the same way a phrase cell does.
    if (onEdit) {
      onEdit()
      return
    }
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [onSelect, onEdit, reorder])
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second tab out from under the one
    // already in the pointer's hand.
    disabled: reorder ? reorder.dragging : active && !onEdit,
  })

  const reorderLabel = reorder
    ? reorder.held
      ? `Holding ${label}. Dwell another category to drop it there, or here to put it back`
      : reorder.heldLabel
        ? `Drop ${reorder.heldLabel} here`
        : `Move ${label}`
    : null

  return (
    <div
      className={cx(
        'filter-tab',
        active && 'active',
        dwelling && 'dwelling',
        flash && 'flashed',
        onEdit && !reorder && 'edit-mode',
        reorder && 'reorderable',
        reorder?.held && 'is-held',
        // Somewhere the held tab could go — every other category, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.actionDwellMs)}
      role="tab"
      aria-selected={active}
      aria-label={reorderLabel ?? (onEdit ? `Rename category: ${label}` : label)}
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder && (e => {
        // Without this the browser refuses the drop outright.
        e.preventDefault()
        reorder.onDragOver()
      })}
      onDragEnd={reorder?.onDragEnd}
      onDrop={reorder && (e => {
        e.preventDefault()
        reorder.onDrop()
      })}
      {...props}
      tabIndex={0}
    >
      {label}
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

/** The controls at the end of the bar: add, sort, reorder. */
function FilterBarButton({ className, label, pressed, disabled, onActivate, children }: {
  className: string
  label: string
  pressed?: boolean
  disabled?: boolean
  onActivate: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('filter-tab filter-bar-btn', className, active && 'dwelling', pressed && 'is-on')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function ReorderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="7 8 4 5 1 8" /><line x1="4" y1="5" x2="4" y2="19" />
      <polyline points="17 16 20 19 23 16" /><line x1="20" y1="19" x2="20" y2="5" />
    </svg>
  )
}

/* The two arrangements, drawn as what they are. Alphabetical is tidy lines
   descending in length under an A-to-Z arrow; the user's own is the same lines
   jumbled, beside a grip. Neither can be mistaken for the reorder button's
   opposing arrows, which sits right next to them. */

function SortAlphaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="13" y2="6" /><line x1="4" y1="12" x2="11" y2="12" /><line x1="4" y1="18" x2="9" y2="18" />
      <polyline points="17 6 20 3 23 6" /><line x1="20" y1="3" x2="20" y2="21" />
    </svg>
  )
}

function CustomOrderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="11" y2="6" /><line x1="4" y1="12" x2="15" y2="12" /><line x1="4" y1="18" x2="8" y2="18" />
      {[6, 12, 18].map(y => (
        <g key={y}>
          <circle cx="18.5" cy={y} r="1.4" fill="currentColor" stroke="none" />
          <circle cx="22" cy={y} r="1.4" fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  )
}

function FilterArrow({ onAction, repeat, label, children }: {
  onAction: () => void
  repeat?: boolean
  label: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, { repeatMs: repeat ? 200 : undefined })
  return (
    <div
      className={cx('filter-arrow', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      {children}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function FilterBar({
  categories,
  activeFilter,
  onSelect,
  onEditCategory,
  onAddCategory,
  reordering,
  isAlphabetical,
  canRestoreOrder,
  onToggleReorder,
  onToggleSort,
  onReorder,
  onLift,
}: {
  categories: { id: string; label: string }[]
  activeFilter: string
  onSelect: (id: string) => void
  onEditCategory?: (name: string) => void
  onAddCategory?: () => void
  /** All of the below are edit-mode only. */
  reordering?: boolean
  /** Which arrangement is on show. */
  isAlphabetical?: boolean
  /** Whether an arrangement of the user's own exists to switch back to. */
  canRestoreOrder?: boolean
  onToggleReorder?: () => void
  onToggleSort?: () => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a tab is picked up — the styling alone says nothing aloud. */
  onLift?: (name: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Which tab is in the air, whether picked up by dwell or by drag. Transient,
  // so it lives here rather than in the store.
  const [held, setHeld] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const scrollTo = useCallback((pos: number) => scrollRef.current?.scrollTo({ left: pos, behavior: 'smooth' }), [])
  const scrollBy = useCallback((dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' }), [])

  // Switching the mode off puts down whatever was in the air. Without this the
  // tab stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the tab under the pointer.
  const toggleReorder = useCallback(() => {
    setHeld(null)
    onToggleReorder?.()
  }, [onToggleReorder])

  const liftOrDrop = useCallback(
    (name: string) => {
      // Dwelling the tab already in hand puts it back where it was, which is
      // the only way out of a lift for someone with no other button to press.
      if (held === null) {
        setHeld(name)
        onLift?.(name)
      } else {
        if (held !== name) onReorder?.(held, name)
        setHeld(null)
      }
    },
    [held, onReorder, onLift],
  )

  const reorderPropsFor = (name: string): ReorderProps => ({
    held: held === name,
    heldLabel: held !== name ? held : null,
    dragging: dragging !== null,
    dropTarget: dropTarget === name && dragging !== name,
    onLiftOrDrop: () => liftOrDrop(name),
    onDragStart: () => {
      // Starting a drag abandons any dwell-lift, so only one is ever in flight.
      setHeld(null)
      setDragging(name)
    },
    onDragOver: () => setDropTarget(name),
    onDragEnd: () => {
      setDragging(null)
      setDropTarget(null)
    },
    onDrop: () => {
      if (dragging && dragging !== name) onReorder?.(dragging, name)
      setDragging(null)
      setDropTarget(null)
    },
  })

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      <FilterArrow onAction={() => scrollTo(0)} label="Go to first category">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="6" x2="5" y2="18"/><polyline points="19 18 11 12 19 6"/>
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollBy(-200)} repeat label="Scroll categories left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </FilterArrow>

      <div ref={scrollRef} className="filter-scroll">
        {categories.map(c => (
          <FilterTab
            key={c.id}
            label={c.label}
            active={activeFilter === c.id}
            onSelect={() => onSelect(c.id)}
            // "All" is not a category, so there is nothing to rename or move.
            onEdit={onEditCategory && c.id !== 'all' ? () => onEditCategory(c.id) : undefined}
            reorder={reordering && c.id !== 'all' ? reorderPropsFor(c.id) : undefined}
          />
        ))}
      </div>

      <FilterArrow onAction={() => scrollBy(200)} repeat label="Scroll categories right">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollTo(999999)} label="Go to last category">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="19" y1="6" x2="19" y2="18"/><polyline points="5 6 13 12 5 18"/>
        </svg>
      </FilterArrow>

      {/* The category tools sit past the scroll controls rather than in with
          the tabs. Inside the scroller they were only reachable by scrolling to
          the end — the controls a user has to find are the ones that must not
          move.

          Adding and sorting share the first slot: adding a category mid-reorder
          would drop whatever is in the air, so the two are never offered at
          once, and the pair keeps a constant width either way. */}
      {(onAddCategory || onToggleReorder) && (
        <div className="filter-bar-tools">
          {reordering
            ? onToggleSort && (
              <FilterBarButton
                className="sort-order-tab"
                // The green fill says which arrangement is on, so the icon and
                // the name say it too rather than leaving colour to carry it.
                // Both then name the switch, since neither state is "off".
                label={
                  isAlphabetical
                    ? 'Sorted A to Z. Switch to your own order'
                    : 'Your own order. Switch to A to Z'
                }
                pressed={isAlphabetical}
                // Nothing to switch to until there is an arrangement of their
                // own to come back to.
                disabled={isAlphabetical && !canRestoreOrder}
                onActivate={onToggleSort}
              >
                {isAlphabetical ? <SortAlphaIcon /> : <CustomOrderIcon />}
              </FilterBarButton>
            )
            : onAddCategory && (
              <FilterBarButton className="add-category-tab" label="Add category" onActivate={onAddCategory}>
                <PlusIcon />
              </FilterBarButton>
            )}

          {onToggleReorder && (
            <FilterBarButton
              className="reorder-tab"
              label={reordering ? 'Done reordering categories' : 'Reorder categories'}
              pressed={reordering}
              onActivate={toggleReorder}
            >
              <ReorderIcon />
            </FilterBarButton>
          )}
        </div>
      )}
    </div>
  )
}
