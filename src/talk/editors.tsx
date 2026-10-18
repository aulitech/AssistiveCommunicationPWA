// Editing what is on the board.
//
// The phrase editor is not here any more: in edit mode the message box *is* the
// editor, and nothing beside it says what is being edited — the box does. **Its voice is not here either**: that is
// in the card's row with the language, which in edit mode is the phrase's pair
// rather than the board's — one pair of controls meaning whichever of the two
// the mode says, rather than two pairs that look alike and are not. What is left
// in this file is the one dialog that survives, which is about a category
// rather than a phrase.

import { useEffect, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { DwellInput } from '../ui/controls'
import { cx, dwellVar } from '../ui/style'

function EditAction({
  kind,
  label,
  onActivate,
  disabled,
}: {
  kind: 'danger' | 'cancel' | 'save'
  label: string
  onActivate: () => void
  disabled?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('edit-action-btn', kind, active && 'dwelling', disabled && 'is-disabled')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      {label}
    </div>
  )
}

/**
 * **A category's two dialogs**: naming a new one, from the bar's add tool, and
 * asking before one goes, from the bin on the tab showing. Renaming is done on
 * the tab itself — see `FilterBar`.
 */
export function CategoryModal({
  name,
  phraseCount,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  /** Null to make a new one; a name to ask before deleting it. */
  name: string | null
  phraseCount: number
  existing: string[]
  onSave: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()

  const clash = existing.some(c => c.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && !clash
  const phrases = `${phraseCount} phrase${phraseCount === 1 ? '' : 's'}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // **Deleting asks first.** It takes the category's order, which somebody may
  // have spent a while on. The question arrives under a pointer resting where
  // the bin was, so **the delete that confirms sits at the far end of the
  // row**, with the way back nearer, and nothing arms until the pointer has
  // moved — a gaze still on the bin cannot answer the question it raised.
  if (name !== null) {
    return (
      <div
        className="edit-modal-scrim"
        onPointerDown={e => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="edit-modal" role="alertdialog" aria-modal="true" aria-label={`Delete ${name}`}>
          <div className="edit-modal-title">Delete {name}?</div>
          <p className="edit-modal-note">
            {phraseCount > 0
              ? `Its ${phrases} stay${phraseCount === 1 ? 's' : ''} in Library, and in any other category ${phraseCount === 1 ? 'it is' : 'they are'} in.`
              : 'It has no phrases in it.'}
          </p>
          <div className="edit-modal-actions is-confirming">
            <EditAction kind="cancel" label="Keep it" onActivate={onClose} />
            <EditAction kind="danger" label="Delete" onActivate={onDelete} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="edit-modal-scrim"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="edit-modal" role="dialog" aria-modal="true" aria-label="Add category">
        <div className="edit-modal-title">Add category</div>

        {/* Focused on arrival, so typing works straight away. */}
        <DwellInput
          className="edit-modal-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault()
              onSave(trimmed)
            }
          }}
          placeholder="Category name…"
          aria-label="Category name"
          autoFocus
        />

        {clash && <p className="edit-modal-note">A category is already called that.</p>}

        <div className="edit-modal-actions">
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={() => onSave(trimmed)} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}
