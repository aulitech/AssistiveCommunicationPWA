
// The two dialogs that change what is in the grid: one for a phrase, one for a
// category. Typed rather than dwelled — they are set-up work, usually done by
// whoever configures the device.

import { useCallback, useEffect, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { type Phrase } from '../core/phrases'
import { VoicePicker } from '../voice/picker'
import { cx, dwellVar } from '../ui/style'

function EditAction({ kind, label, onActivate, disabled }: {
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

/** Sentinel <option> value; the leading space cannot occur in a trimmed name. */
const NEW_CATEGORY = ' __new_category__'

export function EditModal({ phrase, isEmergency, initialText, allCategories, voice, keeping, onSave, onDelete, onClose }: {
  phrase: Phrase | null
  isEmergency: boolean
  /** Seeds a new phrase — the composed message, when adding from the message box. */
  initialText?: string
  allCategories: string[]
  /** The voice this phrase already carries, if any. */
  voice?: string
  /**
   * The phrase is a message already said. Saving keeps it as a phrase of the
   * user's own; deleting forgets having said it. Neither edits anything, so the
   * dialog says what it will do rather than "Edit phrase".
   */
  keeping?: boolean
  onSave: (text: string, category: string, voice: string | undefined) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(phrase?.text ?? initialText ?? '')
  // A phrase whose category is not one of the real ones — a sent message — has
  // to land somewhere the user actually keeps things.
  const [category, setCategory] = useState(
    phrase && allCategories.includes(phrase.category) ? phrase.category : (allCategories[0] ?? ''),
  )
  const [creatingCategory, setCreatingCategory] = useState(false)
  const isNew = phrase === null
  // A brand-new category needs a name before the phrase can be filed under it.
  const canSave = text.trim().length > 0 && (isEmergency || category.trim().length > 0)

  const [chosenVoice, setChosenVoice] = useState(voice ?? '')

  const save = useCallback(() => {
    if (canSave) onSave(text.trim(), category.trim(), chosenVoice || undefined)
  }, [canSave, text, category, chosenVoice, onSave])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="edit-modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={keeping ? 'Keep this message' : isNew ? 'Add phrase' : 'Edit phrase'}
      >
        <div className="edit-modal-title">
          {keeping
            ? 'Keep this message'
            : isNew
              ? isEmergency
                ? 'Add emergency phrase'
                : 'Add phrase'
              : 'Edit phrase'}
        </div>

        <textarea
          className="edit-modal-text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Phrase text…"
          aria-label="Phrase text"
          autoFocus
          rows={3}
        />

        {!isEmergency && (
          <div className="edit-modal-row">
            <label className="edit-modal-label" htmlFor="edit-category">Category</label>
            <select
              id="edit-category"
              className="edit-modal-select"
              value={creatingCategory ? NEW_CATEGORY : category}
              onChange={e => {
                if (e.target.value === NEW_CATEGORY) {
                  setCreatingCategory(true)
                  setCategory('')
                } else {
                  setCreatingCategory(false)
                  setCategory(e.target.value)
                }
              }}
            >
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              {!allCategories.includes(category) && category && !creatingCategory && (
                <option value={category}>{category}</option>
              )}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
          </div>
        )}

        {!isEmergency && creatingCategory && (
          <div className="edit-modal-row">
            <label className="edit-modal-label" htmlFor="new-category">New name</label>
            <input
              id="new-category"
              className="edit-modal-input"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Category name…"
              aria-label="New category name"
              autoFocus
            />
          </div>
        )}

        {/* Optional, and off by default: a board with one voice is the ordinary
            case, and this is for the phrases that want another — somebody
            quoting a person, a name said the way its owner says it, a phrase
            that has to cut through a noisy room. */}
        <div className="edit-modal-row">
          <span className="edit-modal-label">Voice</span>
          {/* The same grid Settings uses, and previewing with this phrase's own
              words rather than a sample: what matters is how *this* sentence
              sounds in that voice. */}
          <VoicePicker
            value={chosenVoice}
            onChange={setChosenVoice}
            defaultLabel="Same as everything else"
            sampleText={text}
          />
        </div>

        <div className="edit-modal-actions">
          {!isNew && (
            <EditAction kind="danger" label={keeping ? 'Forget' : 'Delete'} onActivate={onDelete} />
          )}
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label={keeping ? 'Keep' : 'Save'} onActivate={save} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}

export function CategoryModal({ name, phraseCount, existing, onSave, onDelete, onClose }: {
  name: string | null // null = creating a new one
  phraseCount: number
  existing: string[]
  onSave: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState(name ?? '')
  const isNew = name === null
  const trimmed = value.trim()

  const clash = existing.some(c => c !== name && c.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && trimmed !== name && !clash
  // Only a category with nothing in it can go; otherwise deleting it would
  // silently take phrases with it.
  const canDelete = !isNew && phraseCount === 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="edit-modal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Add category' : 'Rename category'}>
        <div className="edit-modal-title">{isNew ? 'Add category' : 'Rename category'}</div>

        <input
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
        {!isNew && phraseCount > 0 && (
          <p className="edit-modal-note">
            {phraseCount} phrase{phraseCount === 1 ? '' : 's'} will move with it. Empty a category before
            deleting it.
          </p>
        )}

        <div className="edit-modal-actions">
          {canDelete && <EditAction kind="danger" label="Delete" onActivate={onDelete} />}
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={() => onSave(trimmed)} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}
