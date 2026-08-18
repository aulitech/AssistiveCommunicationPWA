
// Editing what is on the board.
//
// The phrase editor is not here any more: in edit mode the message box *is* the
// editor, and the strip below it — `PhraseEditBar` — carries the two things a
// phrase has besides its words, its category and its voice. What is left in this
// file is that strip, the grid its category is chosen from, and the one dialog
// that survives, which is about a category rather than a phrase.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { compose, parseSegments } from '../core/phrases'
import { PickerModal, PickerTile } from '../ui/controls'
import { VoicePicker } from '../voice/picker'
import { cx, dwellVar } from '../ui/style'
import { type Draft } from './use-editor'

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

/**
 * Which category a phrase is filed under, chosen from a full-screen grid.
 *
 * It was a `<select>`, which is the one control on this screen a dwell cannot
 * work: the list a native select opens is drawn by the operating system, outside
 * the page, where nothing can be hovered for a second and a half. So it takes
 * the same shape the voice picker does — the grid is the app's answer to
 * "one out of many", and there is no reason for a user to learn two.
 */
function CategoryPicker({ value, categories, countFor, onChange, onCreate }: {
  value: string
  categories: string[]
  /** How many phrases each one holds, which is the second line of its tile. */
  countFor: (name: string) => number
  onChange: (name: string) => void
  /** Asks for a category that does not exist yet; the dialog does the naming. */
  onCreate: () => void
}) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  /** What to put back if they leave without settling on one. */
  const [before, setBefore] = useState(value)

  const openPicker = useCallback(() => {
    setBefore(value)
    setOpen(true)
  }, [value])

  const { active, props } = useDwellControl(settings.actionDwellMs, openPicker)

  const cancel = useCallback(() => {
    onChange(before)
    setOpen(false)
  }, [onChange, before])

  return (
    <>
      <div
        className={cx('picker-trigger category-trigger', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Category: ${value || 'none'}. Choose another`}
        {...props}
      >
        <span className="picker-trigger-label">{value || 'Choose a category'}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </div>

      {open && (
        <PickerModal
          title="Choose a category"
          hint="Where this phrase is filed"
          onDone={() => setOpen(false)}
          onCancel={cancel}
        >
          {categories.map(name => (
            <PickerTile
              key={name}
              name={name}
              detail={`${countFor(name)} ${countFor(name) === 1 ? 'phrase' : 'phrases'}`}
              selected={name === value}
              onSelect={() => onChange(name)}
            />
          ))}
          {/* Last, and it leaves the grid: naming it is a keyboard job, and the
              dialog that does the naming is the same one the category tabs use. */}
          <PickerTile
            name="New category…"
            className="is-new"
            selected={false}
            onSelect={() => {
              setOpen(false)
              onCreate()
            }}
          />
        </PickerModal>
      )}
    </>
  )
}

/**
 * The strip under the message box, in edit mode only: what is being edited, the
 * category it is filed under, and the voice it is said in.
 *
 * Only these two, because everything else a phrase has is its words, and its
 * words are in the box above. Both are triggers rather than lists — each opens
 * a full-screen grid, which is the only shape of "one out of many" a gaze user
 * can work through.
 */
export function PhraseEditBar({ draft, categories, countFor, onCategory, onVoice, onCreateCategory }: {
  draft: Draft
  categories: string[]
  countFor: (name: string) => number
  onCategory: (name: string) => void
  onVoice: (voiceURI: string) => void
  onCreateCategory: () => void
}) {
  // What the phrase reads as, not what it is written as: the voice picker
  // speaks a sample the moment a voice is chosen, and nobody wants to hear
  // "open curly bracket, quote, red, quote" read out — least of all charged to
  // an account by the character.
  const spoken = useMemo(() => compose(parseSegments(draft.text)), [draft.text])

  return (
    <div className="edit-bar" role="group" aria-label="Phrase being edited">
      <span className="edit-bar-title">
        {draft.keeping
          ? 'Keep this message'
          : draft.isNew
            ? draft.isEmergency ? 'New emergency phrase' : 'New phrase'
            : draft.isEmergency ? 'Editing emergency phrase' : 'Editing phrase'}
      </span>

      {/* The emergency bar is the category, so there is nothing to choose. Said
          rather than hidden, because a strip that loses a control between one
          phrase and the next moves the one beside it. */}
      {draft.isEmergency ? (
        <span className="edit-bar-fixed">Emergency</span>
      ) : (
        <CategoryPicker
          value={draft.category}
          categories={categories}
          countFor={countFor}
          onChange={onCategory}
          onCreate={onCreateCategory}
        />
      )}

      {/* Optional, and off by default: a board with one voice is the ordinary
          case, and this is for the phrases that want another — somebody quoting
          a person, a name said the way its owner says it, a phrase that has to
          cut through a noisy room. */}
      <VoicePicker
        value={draft.voice}
        onChange={onVoice}
        defaultLabel="Same as everything else"
        sampleText={spoken}
      />
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
