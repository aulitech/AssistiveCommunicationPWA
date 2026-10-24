// **Which order the phrases are in** — the control at the right end of the
// category tab row. It was the head of the grid's scroll rail, ruled off above
// the arrows; the rail went, and the order is about what the tab shows, so it
// stands at the end of the row of tabs.

import { useDwellControl, holdDwells } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { PickerModal, PickerTile } from '../ui/controls'
import { usePendingChoice } from '../ui/pending-choice'
import { sortName, sortsFor } from '../core/sort'
import { type PhraseSort } from '../core/store'
import { CustomOrderIcon, FrequentIcon, RecentIcon, SortAlphaIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'

/** Which glyph says which arrangement is on. */
const SORT_ICONS: Record<PhraseSort, React.ReactNode> = {
  custom: <CustomOrderIcon />,
  alpha: <SortAlphaIcon />,
  recent: <RecentIcon />,
  frequent: <FrequentIcon />,
}

/**
 * A full-screen grid rather than a list that drops down, for the reason every
 * choice in this app is one — and a cycling button would be worse still here,
 * since four states behind one glyph is three dwells and a guess to reach the
 * one you want. **A tile marks a choice and Done makes it** — see
 * `usePendingChoice`: a rest is how somebody looks at a tile as well as how
 * they pick one, and a grid that commits to the first tile the eye passes over
 * is choosing for them.
 *
 * It **goes quiet rather than away** on the two tabs whose order is not the
 * user's to change, and says why — a control that has gone quiet explains
 * nothing by itself.
 */
export function SortControl({
  sort,
  orderFixed,
  canArrange,
  onChoose,
}: {
  sort: PhraseSort
  /** Why this tab's order cannot be changed, or absent when it can — the answers, and Translations. */
  orderFixed?: string
  /** False under the answers and Translations, which offer no Custom order — see `sortsFor`. */
  canArrange: boolean
  onChoose: (sort: PhraseSort) => void
}) {
  const { settings } = useSettings()
  // Closing puts the board back under a pointer that has not moved, and under a
  // new arrangement the cell arriving there is not the one that was there when
  // the picker opened: a phrase must not be spoken by the screen moving.
  const { open, pending, mark, begin, done, cancel } = usePendingChoice(sort, onChoose, holdDwells)
  const disabled = Boolean(orderFixed)
  const { active, props } = useDwellControl(settings.actionDwellMs, begin, { disabled })

  return (
    <>
      <div
        className={cx('sort-btn', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        // The glyph says which order is on, so the name does too.
        aria-label={
          orderFixed
            ? `Phrase order: ${sortName(sort)}. ${orderFixed}`
            : `Phrase order: ${sortName(sort)}. Choose another`
        }
        {...props}
      >
        {SORT_ICONS[sort]}
        <span className="sort-btn-fill" key={active ? 'a' : 'i'} />
      </div>

      {open && (
        <PickerModal
          title="Order the phrases"
          hint="How every category is arranged"
          onDone={done}
          onCancel={cancel}
        >
          {sortsFor(canArrange).map(option => (
            <PickerTile
              key={option.id}
              name={option.name}
              detail={option.detail}
              // The glyph the control draws while this order is on.
              icon={SORT_ICONS[option.id]}
              selected={option.id === pending}
              onSelect={() => mark(option.id)}
            />
          ))}
        </PickerModal>
      )}
    </>
  )
}
