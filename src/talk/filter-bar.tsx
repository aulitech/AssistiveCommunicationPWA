// The category tabs above the grid, and the controls that arrange them.
//
// The tabs can be reordered by dragging with a mouse or, for a dwell user, by
// holding one tab and then dwelling where it should go. Both write the same
// whole arrangement, and both come from `ui/reorder` — the emergency bar
// arranges by identical rules, so the rules are written once there.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { holdDwells, useDwellControl } from '../ui/dwell'
import { PickerModal, PickerTile } from '../ui/controls'
import { usePendingChoice } from '../ui/pending-choice'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { ChooseIcon, CustomOrderIcon, EditIcon, PlusIcon, ReorderIcon, SortAlphaIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { LIBRARY } from '../core/phrases'
import { tabsThatFit } from '../core/tab-rows'

/** How much of a category's name a tab shows, unless it is the tab showing. */
const CLIP = 7

/**
 * **A tab's name, cut to its first seven characters unless it is the tab
 * showing** — more of them to a row. The whole name stays in the page and only
 * the cut is drawn (`data-short`, see `.tab-label`), so a screen reader, a
 * search and everything else reading the tab reads all of it.
 */
function TabLabel({ label, whole }: { label: string; whole: boolean }) {
  const short = !whole && label.length > CLIP ? `${label.slice(0, CLIP).trimEnd()}…` : undefined
  return (
    <span className="tab-label" data-short={short}>
      {label}
    </span>
  )
}

function FilterTab({
  label,
  active,
  onSelect,
  reorder,
}: {
  label: string
  active: boolean
  onSelect: () => void
  /** Present only in reorder mode, and never on a pinned tab. */
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
    // **A tab goes to its category in every mode.** In edit mode it used to
    // open the category for renaming instead, which left edit mode unable to
    // move between categories at all: editing a phrase under another tab meant
    // leaving the mode, going there and coming back. Renaming is the pencil
    // among the bar's own tools now, acting on the tab that is showing.
    onSelect()
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }, [onSelect, reorder])
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second tab out from under the one
    // already in the pointer's hand.
    disabled: reorder ? reorder.dragging : active,
  })

  return (
    <div
      className={cx(
        'filter-tab',
        active && 'active',
        dwelling && 'dwelling',
        flash && 'flashed',
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
      aria-label={reorder ? reorderLabel(reorder, label, 'category') : label}
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
      <TabLabel label={label} whole={active} />
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

/**
 * **More**, the last tab, for the categories that do not fit: a full-screen
 * grid of every tab, the one showing ticked. A tile marks one and Done goes
 * there — see `ui/pending-choice.ts`. While the tab showing is one it hides, it
 * carries that tab's name and is drawn as the tab showing, so the bar still
 * says where the board is.
 */
function MoreTab({
  categories,
  activeFilter,
  hiding,
  onSelect,
}: {
  categories: { id: string; label: string }[]
  activeFilter: string
  /** The tab showing, where More is hiding it. */
  hiding: string | null
  onSelect: (id: string) => void
}) {
  const { settings } = useSettings()
  // However the grid closes, it closes onto a board under a resting pointer.
  const { open, pending, mark, begin, done, cancel } = usePendingChoice(activeFilter, onSelect, holdDwells)
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, begin)
  return (
    <>
      <div
        className={cx('filter-tab filter-more', hiding && 'active', dwelling && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="tab"
        aria-selected={Boolean(hiding)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hiding ? `${hiding}. More categories` : 'More categories'}
        {...props}
        tabIndex={0}
      >
        {hiding ?? 'More'}
        <ChooseIcon />
        <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
      </div>
      {open && (
        <PickerModal title="Categories" hint="Choose the one to show" onDone={done} onCancel={cancel}>
          {categories.map(c => (
            <PickerTile key={c.id} name={c.label} selected={c.id === pending} onSelect={() => mark(c.id)} />
          ))}
        </PickerModal>
      )}
    </>
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
  /** The tab that is showing, and whether it is a category somebody can rename. */
  const showing = categories.find(c => c.id === activeFilter)
  const renameable = showing !== undefined && !showing.fixed
  // A category is named by itself, so a key here is already something to say.
  const { propsFor, release } = useReorder({ onReorder, onLift })

  /**
   * **One row of tabs**, the rest behind More — a phone held upright with
   * thirty categories was a screen of tabs and no board. Every
   * tab is laid out once more, unseen, to be measured (`.filter-tabs-measure`),
   * and so are the two things More can say. All of them while the tabs are
   * being arranged: a tab behind More is one nobody could pick up or drop on.
   */
  const tabsRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(categories.length)
  const [size, setSize] = useState('')
  const labels = categories.map(c => c.label).join('\n')
  const activeAt = categories.findIndex(c => c.id === activeFilter)
  useLayoutEffect(() => {
    const bar = tabsRef.current
    const measures = measureRef.current
    if (!bar || !measures) return
    const style = getComputedStyle(bar)
    const room = bar.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
    const items = [...measures.children] as HTMLElement[]
    const widths = items.slice(0, -2).map(e => e.offsetWidth)
    const [more, moreNamed] = items.slice(-2).map(e => e.offsetWidth)
    const fit = reordering ? widths.length : tabsThatFit(widths, room, k => (activeAt >= k ? moreNamed! : more!))
    setShown(fit)
  }, [labels, activeAt, reordering, size])
  // Laid out again for a bar of another width, or text of another size.
  useLayoutEffect(() => {
    const bar = tabsRef.current
    if (!bar) return
    const observer = new ResizeObserver(() =>
      setSize(`${bar.clientWidth} ${getComputedStyle(document.documentElement).fontSize}`),
    )
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const hidden = shown < categories.length
  const hiding = hidden && activeAt >= shown ? categories[activeAt]!.label : null

  // Switching the mode off puts down whatever was in the air. Without this the
  // tab stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the tab under the pointer.
  const toggleReorder = useCallback(() => {
    release()
    onToggleReorder?.()
  }, [release, onToggleReorder])

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      {/* **One row of tabs, and More for the rest**, rather than a bar that
          scrolled: that needed six arrows for a dwell to move along it, and a
          tab off the end of it was a category nobody could see was there. */}
      <div ref={tabsRef} className="filter-tabs">
        {(hidden ? categories.slice(0, shown) : categories).map(c => (
          <FilterTab
            key={c.id}
            label={c.label}
            active={activeFilter === c.id}
            onSelect={() => onSelect(c.id)}
            reorder={reordering && !c.fixed ? propsFor(c.id) : undefined}
          />
        ))}
        {hidden && (
          <MoreTab categories={categories} activeFilter={activeFilter} hiding={hiding} onSelect={onSelect} />
        )}
        {/* Every tab again, unseen and unreachable, to be measured — drawn as
            the tab showing is, its words the heaviest a tab's get. */}
        <div ref={measureRef} className="filter-tabs-measure" aria-hidden="true">
          {categories.map(c => (
            <span key={c.id} className="filter-tab active">
              <TabLabel label={c.label} whole={c.id === activeFilter} />
            </span>
          ))}
          <span className="filter-tab filter-more active">
            More
            <ChooseIcon />
          </span>
          <span className="filter-tab filter-more active">
            {activeAt >= 0 ? categories[activeAt]!.label : 'More'}
            <ChooseIcon />
          </span>
        </div>
      </div>

      {/* The category tools sit at the end of the bar rather than in with the
          tabs, where they would move every time a category was added or
          renamed — the controls a user has to find are the ones that must not
          move.

          Adding and sorting share the first slot: adding a category mid-reorder
          would drop whatever is in the air, so the two are never offered at
          once, and the pair keeps a constant width either way. */}
      {(onAddCategory || onEditCategory || onToggleReorder) && (
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

          {/* Renaming the tab that is showing. **Quiet rather than away** where
              that tab is not one somebody made — Library, which holds every
              phrase, and the two records — or while
              the tabs are being arranged: the tools are aimed at by position,
              and one that came and went would move the one beside it. */}
          {onEditCategory && (
            <FilterBarButton
              className="rename-category-tab"
              label={
                reordering
                  ? 'Finish reordering to rename a category'
                  : renameable
                    ? `Rename category: ${showing?.label}`
                    : showing?.id === LIBRARY
                      ? 'Library holds every phrase, so it cannot be renamed'
                      : `${showing?.label ?? 'This tab'} is not a category, so it cannot be renamed`
              }
              disabled={reordering || !renameable}
              onActivate={() => showing && onEditCategory(showing.id)}
            >
              <EditIcon />
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
