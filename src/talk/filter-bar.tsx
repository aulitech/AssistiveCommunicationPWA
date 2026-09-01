// The category tabs above the grid, and the controls that arrange them.
//
// The tabs can be reordered by dragging with a mouse or, for a dwell user, by
// holding one tab and then dwelling where it should go. Both write the same
// whole arrangement, and both come from `ui/reorder` — the emergency bar
// arranges by identical rules, so the rules are written once there.

import { useCallback, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { CustomOrderIcon, PageIcon, PlusIcon, ReorderIcon, SortAlphaIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'

function FilterTab({
  label,
  active,
  onSelect,
  onEdit,
  reorder,
}: {
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
      aria-label={
        reorder ? reorderLabel(reorder, label, 'category') : onEdit ? `Rename category: ${label}` : label
      }
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={
        reorder &&
        (e => {
          // Without this the browser refuses the drop outright.
          e.preventDefault()
          reorder.onDragOver()
        })
      }
      onDragEnd={reorder?.onDragEnd}
      onDrop={
        reorder &&
        (e => {
          e.preventDefault()
          reorder.onDrop()
        })
      }
      {...props}
      tabIndex={0}
    >
      {label}
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

/** The controls at the end of the bar: add, sort, reorder. */
function FilterBarButton({
  className,
  label,
  pressed,
  disabled,
  onActivate,
  children,
}: {
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

/** How far a nudge moves the tabs, and the overlap a page leaves behind it. */
const SCROLL_STEP = 200

function FilterArrow({
  onAction,
  repeat,
  label,
  className,
  children,
}: {
  onAction: () => void
  repeat?: boolean
  label: string
  /** `filter-arrow-end` on the two that go all the way — see the stylesheet. */
  className?: string
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onAction, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
  })
  return (
    <div
      className={cx('filter-arrow', className, active && 'dwelling')}
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
  /** `fixed` marks a tab that is not a category: nothing to rename or move. */
  categories: { id: string; label: string; fixed?: boolean }[]
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
  // A category is named by itself, so a key here is already something to say.
  const { propsFor, release } = useReorder({ onReorder, onLift })

  const scrollTo = useCallback((pos: number) => scrollRef.current?.scrollTo({ left: pos, behavior: 'smooth' }), [])
  const scrollBy = useCallback((dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' }), [])
  // A screenful of tabs, less one nudge's worth. Tabs are pills of every
  // different width, so a jump of exactly one screen can leave one cut in half at
  // the edge — and half a category is a target a gaze user can hit meaning the
  // one beside it. The floor is for a bar narrower than the overlap.
  const scrollPage = useCallback(
    (direction: 1 | -1) => {
      const extent = scrollRef.current?.clientWidth ?? 0
      scrollBy(direction * Math.max(extent - SCROLL_STEP, SCROLL_STEP))
    },
    [scrollBy],
  )

  // Switching the mode off puts down whatever was in the air. Without this the
  // tab stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the tab under the pointer.
  const toggleReorder = useCallback(() => {
    release()
    onToggleReorder?.()
  }, [release, onToggleReorder])

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      <FilterArrow onAction={() => scrollTo(0)} className="filter-arrow-end" label="Go to first category">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="6" x2="5" y2="18" />
          <polyline points="19 18 11 12 19 6" />
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollPage(-1)} repeat label="Previous page of categories">
        <PageIcon direction="left" />
      </FilterArrow>

      <FilterArrow onAction={() => scrollBy(-SCROLL_STEP)} repeat label="Scroll categories left">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </FilterArrow>

      <div ref={scrollRef} className="filter-scroll">
        {categories.map(c => (
          <FilterTab
            key={c.id}
            label={c.label}
            active={activeFilter === c.id}
            onSelect={() => onSelect(c.id)}
            onEdit={onEditCategory && !c.fixed ? () => onEditCategory(c.id) : undefined}
            reorder={reordering && !c.fixed ? propsFor(c.id) : undefined}
          />
        ))}
      </div>

      <FilterArrow onAction={() => scrollBy(SCROLL_STEP)} repeat label="Scroll categories right">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </FilterArrow>

      <FilterArrow onAction={() => scrollPage(1)} repeat label="Next page of categories">
        <PageIcon direction="right" />
      </FilterArrow>

      <FilterArrow onAction={() => scrollTo(999999)} className="filter-arrow-end" label="Go to last category">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="6" x2="19" y2="18" />
          <polyline points="5 6 13 12 5 18" />
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
                    isAlphabetical ? 'Sorted A to Z. Switch to your own order' : 'Your own order. Switch to A to Z'
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
