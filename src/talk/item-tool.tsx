// The tools the thing being edited carries — see `ItemTool`.

import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { cx, dwellVar } from '../ui/style'

/**
 * **A tool on the thing being edited** — the tab showing, the phrase open in
 * the message box, the emergency phrase open there: the drag pad that lifts it
 * to be put somewhere else, and the bin. Bare glyphs flush with the item's
 * right edge, each with a fill rising behind it as it is rested on.
 */
export function ItemTool({
  className,
  label,
  pressed,
  onActivate,
  drag,
  children,
}: {
  className: string
  label: string
  pressed?: boolean
  onActivate: () => void
  /** A drag pad a mouse can drag, as well as one a dwell lifts. */
  drag?: { onDragStart: () => void; onDragEnd: () => void }
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
      draggable={drag ? true : undefined}
      onDragStart={drag?.onDragStart}
      onDragEnd={drag?.onDragEnd}
      {...props}
    >
      {children}
      <span className="tab-tool-fill" key={active ? 'a' : 'i'} />
    </span>
  )
}
