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
import { holdDwellsUntilMoved, useDwellControl } from '../ui/dwell'
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

export function CategoryModal({
  name,
  phraseCount,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  name: string | null // null = creating a new one
  phraseCount: number
  existing: string[]
  onSave: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState(name ?? '')
  // Deleting asks first. It takes the category's order, which somebody may
  // have spent a while on, and the bin is one dwell from Save — so the dwell on
  // Delete only asks.
  const [confirming, setConfirming] = useState(false)
  const isNew = name === null
  const trimmed = value.trim()

  const clash = existing.some(c => c !== name && c.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && trimmed !== name && !clash
  const phrases = `${phraseCount} phrase${phraseCount === 1 ? '' : 's'}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The dialog changes under a pointer resting where Delete was, so **the
  // delete that confirms sits at the other end of the row**, where Save was,
  // with the way back at Delete's end — and nothing arms until the pointer has
  // moved, so a gaze still on the first Delete cannot answer the question it
  // raised.
  const ask = (asking: boolean) => {
    holdDwellsUntilMoved()
    setConfirming(asking)
  }

  if (confirming && name !== null) {
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
            <EditAction kind="cancel" label="Keep it" onActivate={() => ask(false)} />
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
      <div
        className="edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Add category' : 'Rename category'}
      >
        <div className="edit-modal-title">{isNew ? 'Add category' : 'Rename category'}</div>

        {/* Focused on arrival, so typing works straight away; the dwell is for
            putting the caret somewhere other than where that left it — renaming
            "Medical" to "Medical history" is the end, and fixing a letter in the
            middle is not. */}
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
        {!isNew && phraseCount > 0 && <p className="edit-modal-note">{phrases} will move with it.</p>}

        <div className="edit-modal-actions">
          {!isNew && <EditAction kind="danger" label="Delete" onActivate={() => ask(true)} />}
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={() => onSave(trimmed)} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}
