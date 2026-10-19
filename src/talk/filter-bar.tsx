// The category tabs above the grid, and the controls that arrange them.
//
// **In edit mode the tab showing carries its own tools** — its name, which a
// rest makes a field to rename it where it stands, and a reorder tool picking
// it up to put it somewhere else along the bar. A tab is
// lifted by its own reorder tool, which turns it blue, and dropped by a dwell
// on another tab; a mouse can drag it there too. Both come from `ui/reorder` —
// the emergency bar arranges by identical rules, so the rules are written once
// there.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { holdDwells, useDwellControl } from '../ui/dwell'
import { DwellInput, PickerModal, PickerTile } from '../ui/controls'
import { usePendingChoice } from '../ui/pending-choice'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { ChooseIcon, GripIcon, PlusIcon, TrashIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { TAB_GAP, tabsThatFit } from '../core/tab-rows'

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

/** One of the tools on the tab showing: rename, reorder, delete. */
function TabTool({
  className,
  label,
  pressed,
  onActivate,
  children,
}: {
  className: string
  label: string
  pressed?: boolean
  onActivate: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate)
  return (
    <span
      className={cx('tab-tool', className, active && 'dwelling', pressed && 'is-on')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
      <span className="tab-tool-fill" key={active ? 'a' : 'i'} />
    </span>
  )
}

function FilterTab({
  label,
  active,
  onSelect,
  reorder,
  drag,
  held,
  name,
  tools,
}: {
  label: string
  active: boolean
  onSelect: () => void
  /** Present on every other category while one is in the air, and never on a pinned tab. */
  reorder?: ReorderProps
  /** A mouse dragging it onto another, in edit mode — the one gesture a dwell has no need of lifting for. */
  drag?: ReorderProps
  /** This is the tab in the air — lifted by its own reorder tool. */
  held?: boolean
  /** What stands where the name does while it is being renamed. */
  name?: React.ReactNode
  /** The tab showing's own tools, in edit mode. */
  tools?: React.ReactNode
}) {
  const { settings } = useSettings()
  const [flash, setFlash] = useState(false)
  const handleActivate = useCallback(() => {
    // While one is in the air, a tab is somewhere to put it.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    // **A tab goes to its category in every mode.**
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
        tools ? 'has-tools' : null,
        held && 'is-held',
        // Somewhere the held tab could go — every other category, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.actionDwellMs)}
      role="tab"
      aria-selected={active}
      aria-label={reorder ? reorderLabel(reorder, label, 'category') : label}
      draggable={drag ? true : undefined}
      onDragStart={drag?.onDragStart}
      onDragOver={
        drag &&
        (e => {
          // Without this the browser refuses the drop outright.
          e.preventDefault()
          drag.onDragOver()
        })
      }
      onDragEnd={drag?.onDragEnd}
      onDrop={
        drag &&
        (e => {
          e.preventDefault()
          drag.onDrop()
        })
      }
      {...props}
      // Selected says it is the tab showing; disabled would say so of what is
      // inside it too — its name, which renames it, and its tools — which are live.
      aria-disabled={tools || name ? undefined : props['aria-disabled']}
      tabIndex={0}
    >
      {name ?? <TabLabel label={label} whole={active} />}
      {tools && <span className="tab-tools">{tools}</span>}
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
    </div>
  )
}

/**
 * **The name of the tab showing, in edit mode, is where renaming starts** — a
 * rest on it, or a click, makes it a field. Its whole name, as the tab showing
 * draws it, and a fill along its foot as it is rested on.
 */
function TabName({ label, onRename }: { label: string; onRename: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onRename)
  return (
    <span
      className={cx('tab-name', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={`Rename ${label}`}
      {...props}
    >
      <TabLabel label={label} whole />
      <span className="tab-name-fill" key={active ? 'a' : 'i'} />
    </span>
  )
}

/**
 * **The name of the tab showing, as a field**, while it is being renamed —
 * typed into by the keyboard or Peri's own, and saved by Enter, by going to
 * another tab or out of edit mode, or by the field losing the caret. Escape
 * puts it back as it was.
 */
function RenameField({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <DwellInput
      className="tab-rename"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSave()
        } else if (e.key === 'Escape') onCancel()
      }}
      onBlur={onSave}
      aria-label="Category name"
      autoFocus
      // The caret after the name, where a rename usually goes on — "Medical"
      // to "Medical history" — rather than before it.
      onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
    />
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

/**
 * **Adding a category, right after the last tab**, as a browser puts its new
 * tab button: a bare plus, with a round wash behind it as it is rested on.
 */
function AddTab({ onActivate }: { onActivate: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate)
  return (
    <div
      className={cx('add-tab', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label="Add category"
      {...props}
    >
      <PlusIcon />
      <span className="add-tab-fill" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function FilterBar({
  categories,
  activeFilter,
  onSelect,
  editing,
  onAddCategory,
  onRename,
  onDelete,
  onReorder,
  onLift,
}: {
  /** `fixed` marks a tab that is not a category: nothing to rename or move. */
  categories: { id: string; label: string; fixed?: boolean }[]
  activeFilter: string
  onSelect: (id: string) => void
  /** Edit mode, where the tab showing carries its tools. */
  editing?: boolean
  onAddCategory?: () => void
  onRename?: (from: string, to: string) => void
  /** Asks first — see `CategoryModal`. */
  onDelete?: (name: string) => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a tab is picked up — the styling alone says nothing aloud. */
  onLift?: (name: string) => void
}) {
  /** The tab that is showing, and whether it is a category somebody made — which has tools in edit mode. */
  const showing = categories.find(c => c.id === activeFilter)
  const ownTools = Boolean(editing) && showing !== undefined && !showing.fixed
  // A category is named by itself, so a key here is already something to say.
  const { propsFor, release, held } = useReorder({ onReorder, onLift })

  // Out of edit mode, or on to another tab, whatever was in the air is put
  // back where it was — the tools that lifted it have gone.
  useEffect(() => {
    release()
  }, [activeFilter, editing, release])

  /**
   * **Renaming the tab showing where it stands.** The name becomes a field and
   * the reorder tool a bin; the pencil again saves it. Let go on another tab,
   * or out of edit mode, as state that follows other state is let go here.
   */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  // Whether this rename has been saved or put back already — the field goes as
  // either happens, and a field going can tell it it has lost the caret.
  const settled = useRef(true)
  const startRenaming = (id: string) => {
    settled.current = false
    setRenaming({ id, value: id })
  }
  const finishRenaming = useCallback(() => {
    if (settled.current || !renaming) return
    settled.current = true
    const to = renaming.value.trim()
    setRenaming(null)
    // Nothing, or the name it had, is no change; another category's name is a
    // clash, and the old name stays.
    const others = categories.filter(c => !c.fixed && c.id !== renaming.id).map(c => c.label.toLowerCase())
    if (to && to !== renaming.id && !others.includes(to.toLowerCase())) onRename?.(renaming.id, to)
  }, [renaming, categories, onRename])
  const putBack = () => {
    settled.current = true
    setRenaming(null)
  }
  // **Going to another tab, or out of edit mode, saves it** — there is no
  // control to save it with, the field being the name itself.
  useEffect(() => {
    if (renaming && (!ownTools || renaming.id !== activeFilter)) finishRenaming()
  }, [renaming, ownTools, activeFilter, finishRenaming])

  /**
   * **One row of tabs**, the rest behind More — a phone held upright with
   * thirty categories was a screen of tabs and no board. Every
   * tab is laid out once more, unseen, to be measured (`.filter-tabs-measure`),
   * and so are the two things More can say, and the tab showing with its tools.
   * All of them while one is in the air: a tab behind More is one nobody could
   * drop it on.
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
    const rowRoom = bar.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
    const items = [...measures.children] as HTMLElement[]
    const widths = items.slice(0, -3).map(e => e.offsetWidth)
    const [add, more, moreNamed] = items.slice(-3).map(e => e.offsetWidth)
    // The add button follows the last tab on the same row, so the row is that
    // much shorter for tabs.
    const room = rowRoom - (onAddCategory ? add! + TAB_GAP : 0)
    // A tab showing that More would hide is, in edit mode, drawn as itself
    // before More, so its tools are there: room for it, and for More saying
    // only "More". Otherwise More carries its name.
    const hiddenShowing = ownTools ? widths[activeAt]! + TAB_GAP + more! : moreNamed!
    const fit = held ? widths.length : tabsThatFit(widths, room, k => (activeAt >= k ? hiddenShowing : more!))
    setShown(fit)
  }, [labels, activeAt, held, ownTools, renaming, size, onAddCategory])
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
  const showingHidden = hidden && activeAt >= shown
  // The tab showing, among those More hides: drawn as itself before More in
  // edit mode, where it has tools; named on More otherwise.
  const drawnBeforeMore = showingHidden && ownTools ? categories[activeAt]! : null
  const hiding = showingHidden && !ownTools ? categories[activeAt]!.label : null

  /** The tab showing's tools: rename and reorder, or rename and delete while renaming. */
  /** The tab showing's one tool: reorder, or the bin while it is being renamed. */
  /**
   * **The drag pad only where there is a row worth arranging** — five tabs on
   * the bar or more. Fewer, and moving one is barely a move, while the pad is
   * one more thing on the tab to aim past. The row keeps its room either way
   * (`.filter-tabs-measure` measures it with the pad), so the tabs do not
   * shift as it comes and goes.
   */
  const tabsOnBar = hidden ? shown + (drawnBeforeMore ? 1 : 0) + 1 : categories.length
  const canMove = tabsOnBar >= 5 || held !== null
  const toolsFor = (id: string) =>
    renaming?.id === id ? (
      <TabTool
        className="delete-tool"
        label={`Delete ${id}`}
        onActivate={() => {
          putBack()
          onDelete?.(id)
        }}
      >
        <TrashIcon />
      </TabTool>
    ) : canMove ? (
      <TabTool
        className="reorder-tool"
        label={held === id ? `Put ${id} back where it was` : `Move ${id}`}
        pressed={held === id}
        onActivate={() => propsFor(id).onLiftOrDrop()}
      >
        <GripIcon />
      </TabTool>
    ) : null

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      {/* **One row of tabs, and More for the rest**, rather than a bar that
          scrolled: that needed six arrows for a dwell to move along it, and a
          tab off the end of it was a category nobody could see was there. */}
      <div ref={tabsRef} className="filter-tabs">
        {[
          ...(hidden ? categories.slice(0, shown) : categories),
          ...(drawnBeforeMore ? [drawnBeforeMore] : []),
        ].map(c => {
          const mine = ownTools && c.id === activeFilter
          return (
            <FilterTab
              key={c.id}
              label={c.label}
              active={activeFilter === c.id}
              onSelect={() => onSelect(c.id)}
              reorder={held && held !== c.id && !c.fixed ? propsFor(c.id) : undefined}
              drag={editing && !c.fixed ? propsFor(c.id) : undefined}
              held={held === c.id}
              name={
                mine && renaming?.id === c.id ? (
                  <RenameField
                    value={renaming.value}
                    onChange={value => setRenaming({ id: c.id, value })}
                    onSave={finishRenaming}
                    onCancel={putBack}
                  />
                ) : mine ? (
                  <TabName label={c.label} onRename={() => startRenaming(c.id)} />
                ) : undefined
              }
              tools={mine ? (toolsFor(c.id) ?? undefined) : undefined}
            />
          )
        })}
        {hidden && (
          <MoreTab categories={categories} activeFilter={activeFilter} hiding={hiding} onSelect={onSelect} />
        )}
        {onAddCategory && <AddTab onActivate={onAddCategory} />}
        {/* Every tab again, unseen and unreachable, to be measured — drawn as
            the tab showing is, its words the heaviest a tab's get. */}
        <div ref={measureRef} className="filter-tabs-measure" aria-hidden="true">
          {categories.map(c => {
            const mine = ownTools && c.id === activeFilter
            return (
              <span key={c.id} className={cx('filter-tab active', mine && 'has-tools')}>
                {mine && renaming?.id === c.id ? (
                  <span className="tab-rename" />
                ) : (
                  <TabLabel label={c.label} whole={c.id === activeFilter} />
                )}
                {mine && (
                  <span className="tab-tools">
                    <span className="tab-tool">
                      <GripIcon />
                    </span>
                  </span>
                )}
              </span>
            )
          })}
          <span className="add-tab">
            <PlusIcon />
          </span>
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
    </div>
  )
}
