// The category tabs above the grid, and the controls that arrange them.
//
// **The tab showing carries its own tools, in every mode** — its name, which a
// rest makes a field to rename it where it stands, and a reorder tool picking
// it up to put it somewhere else along the bar. They were edit mode's alone;
// the tabs are the board's own arrangement rather than a phrase being changed,
// so they work the same whether the board is speaking or being edited. A tab is
// lifted by its own reorder tool, which turns it blue, and dropped by a dwell
// on another tab; a mouse can drag it there too. Both come from `ui/reorder` —
// the emergency bar arranges by identical rules, so the rules are written once
// there.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { holdDwells, useDwellControl } from '../ui/dwell'
import { DwellInput, PickerModal } from '../ui/controls'
import { usePendingChoice } from '../ui/pending-choice'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { moveInOrder } from '../core/store'
import { useSettings } from '../ui/settings'
import { CustomizeIcon, EyeIcon, EyeOffIcon, GripIcon, PlusIcon, TrashIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { TAB_GAP, tabsThatFit } from '../core/tab-rows'
import { ItemTool } from './item-tool'

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
  /** A mouse dragging it onto another — the one gesture a dwell has no need of lifting for. */
  drag?: ReorderProps
  /** This is the tab in the air — lifted by its own reorder tool. */
  held?: boolean
  /** What stands where the name does while it is being renamed. */
  name?: React.ReactNode
  /** The tab showing's own tools. */
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
 * **The name of the tab showing is where renaming starts** — a
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
 * another tab, or by the field losing the caret. Escape
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

/** What More holds while it is open, and writes on Done. */
interface Arrangement {
  /** The tab to go to. */
  choice: string
  hidden: string[]
  /** The categories somebody made, in their order; Library and the records stay first. */
  order: string[]
}

/**
 * **More**, the last tab, whenever any tab is off the bar — for room, or
 * hidden: a full-screen grid of every tab, where one is chosen to go to, put
 * back on the bar or taken off it, and the categories somebody made moved
 * about. **Nothing changes until Done**, and Cancel throws all of it away — see
 * `ui/pending-choice.ts`.
 */
function MoreTab({
  categories,
  activeFilter,
  hiddenTabs,
  noRoomFor,
  onSelect,
  onArrange,
}: {
  categories: { id: string; label: string; fixed?: boolean }[]
  activeFilter: string
  hiddenTabs: readonly string[]
  /**
   * What the bar would have no room for with these hidden and in this order —
   * said on the tiles, and asked again as they change here before Done.
   */
  noRoomFor: (hidden: readonly string[], order: readonly string[]) => string[]
  onSelect: (id: string) => void
  onArrange?: (hidden: string[], order: string[]) => void
}) {
  const { settings } = useSettings()
  const now: Arrangement = {
    choice: activeFilter,
    hidden: [...hiddenTabs],
    order: categories.filter(c => !c.fixed).map(c => c.id),
  }
  const commit = (next: Arrangement) => {
    // Only what changed, so Done with nothing moved writes nothing.
    const same = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((x, i) => x === b[i])
    if (!same([...next.hidden].sort(), [...hiddenTabs].sort()) || !same(next.order, now.order))
      onArrange?.(next.hidden, next.order)
    // The tab showing, taken off the bar and nothing else chosen: on to the
    // next tab still on it, as the eye on the bar does. One chosen while off
    // the bar is where somebody asked to go.
    let choice = next.choice
    if (choice === activeFilter && next.hidden.includes(choice)) {
      const all = [...categories.filter(c => c.fixed).map(c => c.id), ...next.order]
      const on = all.filter(id => !next.hidden.includes(id) || id === choice)
      const here = on.indexOf(choice)
      choice = on[here + 1] ?? on[here - 1] ?? choice
    }
    if (choice !== activeFilter) onSelect(choice)
  }
  // However the grid closes, it closes onto a board under a resting pointer.
  const { open, pending, mark, begin, done, cancel } = usePendingChoice(now, commit, holdDwells)
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, begin)

  // Lifting a category's tile and dropping it on another moves it — in what
  // Done will write, not on the board.
  const byId = new Map(categories.map(c => [c.id, c]))
  const { propsFor, release, held } = useReorder({
    onReorder: (from, to) => mark({ ...pending, order: moveInOrder(pending.order, from, to) }),
    labelOf: id => byId.get(id)?.label ?? id,
  })
  useEffect(() => {
    if (!open) release()
  }, [open, release])

  const noRoom = noRoomFor(pending.hidden, pending.order)
  const shownInGrid = [
    ...categories.filter(c => c.fixed),
    ...pending.order.map(id => byId.get(id)).filter((c): c is (typeof categories)[number] => c !== undefined),
  ]

  return (
    <>
      <div
        className={cx('filter-tab filter-more', dwelling && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Customize tabs"
        {...props}
        tabIndex={0}
      >
        <CustomizeIcon />
        <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
      </div>
      {open && (
        <PickerModal
          title="Customize tabs"
          hint="Rest on one to go to it. The eye takes it off the bar or puts it back; the pad moves your own."
          onDone={done}
          onCancel={cancel}
        >
          {shownInGrid.map(c => {
            const hidden = pending.hidden.includes(c.id)
            return (
              <MoreTile
                key={c.id}
                label={c.label}
                chosen={c.id === pending.choice}
                hidden={hidden}
                cramped={!hidden && noRoom.includes(c.id)}
                held={held === c.id}
                drop={held && held !== c.id && !c.fixed ? propsFor(c.id) : undefined}
                onChoose={() => mark({ ...pending, choice: c.id })}
                onToggle={() =>
                  mark({
                    ...pending,
                    hidden: hidden ? pending.hidden.filter(id => id !== c.id) : [...pending.hidden, c.id],
                  })
                }
                onLift={c.fixed ? undefined : () => propsFor(c.id).onLiftOrDrop()}
              />
            )
          })}
        </PickerModal>
      )}
    </>
  )
}

/**
 * **A tab in More's grid**: its name, which chooses it — or, while another is
 * lifted, puts that one here — and, against its right edge, an eye that puts
 * it on the bar or takes it off and, on a category somebody made, a drag pad.
 * Three controls side by side rather than one tile with tools on it, so a rest
 * on a tool is never a rest on the tile as well.
 */
function MoreTile({
  label,
  chosen,
  hidden,
  cramped,
  held,
  drop,
  onChoose,
  onToggle,
  onLift,
}: {
  label: string
  chosen: boolean
  hidden: boolean
  /** On the bar, but the row has no room for it, so it is only reached here. */
  cramped: boolean
  held: boolean
  /** Present on every other category's tile while one is lifted. */
  drop?: ReorderProps
  onChoose: () => void
  onToggle: () => void
  /** Absent on Library and the records, which stay first. */
  onLift?: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, drop ? drop.onLiftOrDrop : onChoose)
  return (
    <div
      className={cx(
        'picker-tile more-tile',
        chosen && 'is-selected',
        hidden && 'is-off-bar',
        cramped && 'is-no-room',
        held && 'is-held',
        drop && 'is-drop-zone',
      )}
      role="group"
      aria-label={label}
    >
      <div
        className={cx('more-tile-name', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="option"
        aria-selected={chosen}
        aria-label={
          drop
            ? `Put ${drop.heldLabel} here`
            : hidden
              ? `${label}, hidden from the bar`
              : cramped
                ? `${label}, no room for it on the bar`
                : label
        }
        {...props}
      >
        <span className="picker-tile-name">{label}</span>
        {hidden && <span className="picker-tile-detail">Hidden</span>}
        {cramped && <span className="picker-tile-detail">No room</span>}
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </div>
      <span className="more-tile-tools">
        <ItemTool
          className="hide-tool"
          label={hidden ? `Show ${label} on the bar` : `Hide ${label} from the bar`}
          pressed={hidden}
          onActivate={onToggle}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </ItemTool>
        {onLift && (
          <ItemTool
            className="reorder-tool"
            label={held ? `Put ${label} back where it was` : `Move ${label}`}
            pressed={held}
            onActivate={onLift}
          >
            <GripIcon />
          </ItemTool>
        )}
      </span>
    </div>
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

/** One empty list, so a bar told nothing is hidden keeps the same one from render to render. */
const NOTHING_HIDDEN: readonly string[] = []

export function FilterBar({
  categories,
  activeFilter,
  onSelect,
  onAddCategory,
  onRename,
  onDelete,
  onReorder,
  onLift,
  after,
  hiddenTabs = NOTHING_HIDDEN,
  onHide,
  onArrange,
}: {
  /** `fixed` marks a tab that is not a category: nothing to rename or move. */
  categories: { id: string; label: string; fixed?: boolean }[]
  activeFilter: string
  onSelect: (id: string) => void
  onAddCategory?: () => void
  onRename?: (from: string, to: string) => void
  /** Asks first — see `CategoryModal`. */
  onDelete?: (name: string) => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a tab is picked up — the styling alone says nothing aloud. */
  onLift?: (name: string) => void
  /** At the row's right end, after the tabs and outside them — the order the phrases are in. */
  after?: React.ReactNode
  /** Tabs somebody has taken off the bar — behind More, which puts them back. */
  hiddenTabs?: readonly string[]
  /** The eye on the tab showing: off the bar, and on to the next tab still on it. */
  onHide?: (id: string) => void
  /** More's Done: what is hidden, and the order of the categories somebody made. */
  onArrange?: (hidden: string[], order: string[]) => void
}) {
  /**
   * The tab that is showing, which carries its tools **in every mode**: an eye
   * that takes it off the bar on every tab, and on a category somebody made its
   * name to rename it and a drag pad — the tabs are arranged, renamed and taken
   * away the same way whether the board is speaking or being edited.
   */
  const showing = categories.find(c => c.id === activeFilter)
  const ownTools = showing !== undefined
  /** What is on the bar: every tab not hidden. The tab showing is drawn even if it is. */
  const onBar = useMemo(() => categories.filter(c => !hiddenTabs.includes(c.id)), [categories, hiddenTabs])
  const showingOffBar = showing !== undefined && hiddenTabs.includes(showing.id)
  const anyHidden = onBar.length < categories.length
  // A category is named by itself, so a key here is already something to say.
  const { propsFor, release, held } = useReorder({ onReorder, onLift })

  // On to another tab, whatever was in the air is put back where it was — the
  // tools that lifted it have gone.
  useEffect(() => {
    release()
  }, [activeFilter, release])

  /**
   * **Renaming the tab showing where it stands.** The name becomes a field and
   * the reorder tool a bin. Let go on another tab, as state that follows
   * other state is let go here.
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
  // **Going to another tab saves it** — there is no
  // control to save it with, the field being the name itself.
  useEffect(() => {
    if (renaming && renaming.id !== activeFilter) finishRenaming()
  }, [renaming, activeFilter, finishRenaming])

  /** Off the bar, and on to the next tab still on it — or the one before, at the end. */
  const hide = (id: string) => {
    const at = onBar.findIndex(c => c.id === id)
    const next = onBar[at + 1] ?? onBar[at - 1]
    if (next && id === activeFilter) onSelect(next.id)
    onHide?.(id)
  }

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
  const [size, setSize] = useState('')
  const activeAt = onBar.findIndex(c => c.id === activeFilter)
  /**
   * **What the bar measured**: each tab's width, the row's room, and More's.
   * Kept rather than spent on the one answer, because Customize asks the same
   * question of a bar that is not there yet — the tabs it would hold with what
   * is hidden and the order as the grid has them before Done.
   */
  const [metrics, setMetrics] = useState<{ widthOf: Map<string, number>; room: number; more: number } | null>(null)
  useLayoutEffect(() => {
    const bar = tabsRef.current
    const measures = measureRef.current
    if (!bar || !measures) return
    const style = getComputedStyle(bar)
    const rowRoom = bar.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
    const items = [...measures.children] as HTMLElement[]
    const widthOf = new Map(categories.map((c, i) => [c.id, items[i]!.offsetWidth]))
    const [add, more] = items.slice(-2).map(e => e.offsetWidth)
    // The add button follows the last tab on the same row, so the row is that
    // much shorter for tabs.
    const room = rowRoom - (onAddCategory ? add! + TAB_GAP : 0)
    setMetrics(current =>
      current &&
      current.room === room &&
      current.more === more &&
      current.widthOf.size === widthOf.size &&
      [...widthOf].every(([id, w]) => current.widthOf.get(id) === w)
        ? current
        : { widthOf, room, more: more! },
    )
  }, [categories, activeFilter, renaming, size, onAddCategory])

  /**
   * **How many of these tabs the row holds** before More — the bar's answer,
   * and Customize's for the bar it is about to make. The tab showing, where
   * More would hide it or it is off the bar, is drawn as itself before More,
   * so its tools are there: room for it and for More. **More is there whenever
   * anything is off the bar**, so its room is kept even where every tab still
   * on it would fit.
   */
  const fitOf = useCallback(
    (bar: readonly { id: string }[], somethingHidden: boolean) => {
      if (!metrics) return bar.length
      const widths = bar.map(c => metrics.widthOf.get(c.id) ?? 0)
      const at = bar.findIndex(c => c.id === activeFilter)
      const showingWidth = (metrics.widthOf.get(activeFilter) ?? 0) + TAB_GAP + metrics.more
      return tabsThatFit(
        widths,
        metrics.room,
        k => (at < 0 || at >= k ? showingWidth : metrics.more),
        somethingHidden,
      )
    },
    [metrics, activeFilter],
  )
  const shown = held ? onBar.length : fitOf(onBar, anyHidden)

  /**
   * **What the row would have no room for**, with these hidden and the
   * categories in this order — said on Customize's tiles, and asked again as
   * the grid's own hidden list and order change before Done, and as the screen
   * does. The tab showing is always drawn, so it is never short of room.
   */
  const noRoomFor = useCallback(
    (hidden: readonly string[], order: readonly string[]) => {
      const byId = new Map(categories.map(c => [c.id, c]))
      const all = [
        ...categories.filter(c => c.fixed),
        ...order.map(id => byId.get(id)).filter((c): c is (typeof categories)[number] => c !== undefined),
      ]
      const bar = all.filter(c => !hidden.includes(c.id))
      return bar
        .slice(fitOf(bar, bar.length < all.length))
        .map(c => c.id)
        .filter(id => id !== activeFilter)
    },
    [categories, fitOf, activeFilter],
  )
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
  const overflow = shown < onBar.length
  const moreShown = overflow || anyHidden
  // The tab showing, where More hides it or it is off the bar: drawn as itself
  // before More, so its tools are there.
  const drawnBeforeMore = showing && (showingOffBar || (overflow && activeAt >= shown)) ? showing : null
  /** The tab showing's tools: rename and reorder, or rename and delete while renaming. */
  /** The tab showing's one tool: reorder, or the bin while it is being renamed. */
  /**
   * **The drag pad only where there is a row worth arranging** — five tabs on
   * the bar or more. Fewer, and moving one is barely a move, while the pad is
   * one more thing on the tab to aim past. The row keeps its room either way
   * (`.filter-tabs-measure` measures it with the pad), so the tabs do not
   * shift as it comes and goes.
   */
  const tabsOnBar = (overflow ? shown : onBar.length) + (drawnBeforeMore ? 1 : 0) + (moreShown ? 1 : 0)
  const canMove = tabsOnBar >= 5 || held !== null
  const toolsFor = (c: { id: string; label: string; fixed?: boolean }) =>
    renaming?.id === c.id ? (
      <ItemTool
        className="delete-tool"
        label={`Delete ${c.id}`}
        onActivate={() => {
          putBack()
          onDelete?.(c.id)
        }}
      >
        <TrashIcon />
      </ItemTool>
    ) : (
      <>
        {onHide && (
          <ItemTool className="hide-tool" label={`Hide ${c.label} from the bar`} onActivate={() => hide(c.id)}>
            <EyeOffIcon />
          </ItemTool>
        )}
        {!c.fixed && canMove && (
          <ItemTool
            className="reorder-tool"
            label={held === c.id ? `Put ${c.id} back where it was` : `Move ${c.id}`}
            pressed={held === c.id}
            onActivate={() => propsFor(c.id).onLiftOrDrop()}
          >
            <GripIcon />
          </ItemTool>
        )}
      </>
    )

  return (
    <div className="filter-bar-wrap" role="tablist" aria-label="Filter phrases by category">
      {/* **One row of tabs, and More for the rest**, rather than a bar that
          scrolled: that needed six arrows for a dwell to move along it, and a
          tab off the end of it was a category nobody could see was there. */}
      <div ref={tabsRef} className="filter-tabs">
        {[...(overflow ? onBar.slice(0, shown) : onBar), ...(drawnBeforeMore ? [drawnBeforeMore] : [])].map(c => {
          const mine = ownTools && c.id === activeFilter
          const renamable = mine && !c.fixed
          return (
            <FilterTab
              key={c.id}
              label={c.label}
              active={activeFilter === c.id}
              onSelect={() => onSelect(c.id)}
              reorder={held && held !== c.id && !c.fixed ? propsFor(c.id) : undefined}
              drag={!c.fixed ? propsFor(c.id) : undefined}
              held={held === c.id}
              name={
                renamable && renaming?.id === c.id ? (
                  <RenameField
                    value={renaming.value}
                    onChange={value => setRenaming({ id: c.id, value })}
                    onSave={finishRenaming}
                    onCancel={putBack}
                  />
                ) : renamable ? (
                  <TabName label={c.label} onRename={() => startRenaming(c.id)} />
                ) : undefined
              }
              tools={mine ? toolsFor(c) : undefined}
            />
          )
        })}
        {moreShown && (
          <MoreTab
            categories={categories}
            activeFilter={activeFilter}
            hiddenTabs={hiddenTabs}
            noRoomFor={noRoomFor}
            onSelect={onSelect}
            onArrange={onArrange}
          />
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
                      <EyeOffIcon />
                    </span>
                    {!c.fixed && (
                      <span className="tab-tool">
                        <GripIcon />
                      </span>
                    )}
                  </span>
                )}
              </span>
            )
          })}
          <span className="add-tab">
            <PlusIcon />
          </span>
          <span className="filter-tab filter-more active">
            <CustomizeIcon />
          </span>
        </div>
      </div>
      {after && <div className="filter-bar-end">{after}</div>}
    </div>
  )
}
