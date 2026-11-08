import { useCallback, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { cx, dwellVar } from '../ui/style'

/**
 * **Pause is the phrase table's left edge** — a strip 1rem wide down the inside
 * of the panel, before the first column. It was the open space in the message
 * card's row of controls, and that space lies between everything a gaze aims
 * at up there, so it paused on a gaze passing between two controls. An edge
 * nothing else shares is chosen on purpose or not at all.
 *
 * At rest it draws nothing and says nothing; rested on, it fills from the foot
 * in the brand's gold. Paused, it is that gold all the way down with *Paused*
 * written along it, and the same rest brings dwelling back. The only control
 * live while paused, so its dwell never depends on the paused state.
 *
 * **After either, it answers nothing until the pointer has left it**: the edge
 * does not move, so a gaze that stays put would otherwise switch straight back.
 */
export function RestEdge({ resting, onToggle }: { resting: boolean; onToggle: () => void }) {
  const { settings } = useSettings()
  const [mustLeave, setMustLeave] = useState(false)
  const toggle = useCallback(() => {
    setMustLeave(true)
    onToggle()
  }, [onToggle])
  const { active, props } = useDwellControl(settings.actionDwellMs, toggle, {
    ignoresRest: true,
    disabled: mustLeave,
  })
  return (
    <div className="rest-edge-place" onPointerLeave={() => setMustLeave(false)}>
      <div
        className={cx('rest-edge', resting && 'is-resting', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-pressed={resting}
        aria-label={
          resting ? 'Paused. Rest here to switch dwell back on' : 'Pause. Switch dwell off everywhere but here'
        }
        {...props}
      >
        {resting && <span aria-hidden="true">Paused</span>}
      </div>
    </div>
  )
}
