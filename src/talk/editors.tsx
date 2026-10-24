// Editing what is on the board.
//
// The phrase editor is not here any more: in edit mode the message box *is* the
// editor, and nothing beside it says what is being edited — the box does. **Its voice is not here either**: that is
// in the card's row with the language, which in edit mode is the phrase's pair
// rather than the board's — one pair of controls meaning whichever of the two
// the mode says, rather than two pairs that look alike and are not. What is left
// in this file is the one dialog that survives, which is about a category
// rather than a phrase.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cancelAllDwells, holdDwellsUntilMoved, useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { DwellInput } from '../ui/controls'
import { cx, dwellVar } from '../ui/style'

function EditAction({
  kind,
  label,
  onActivate,
  disabled,
  armsOnceMoved,
}: {
  kind: 'danger' | 'cancel' | 'save'
  label: string
  onActivate: () => void
  disabled?: boolean
  /** The answers to a bin's question — see `armsOnceMoved` in `ui/dwell.ts`. */
  armsOnceMoved?: boolean
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled, armsOnceMoved })
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
 * **Asking before something goes** — a category, a phrase, an emergency
 * phrase. Every bin asks: it takes something somebody may have spent a while
 * on, and a gaze resting a moment too long is not a decision.
 *
 * The question arrives under a pointer resting where the bin was, so **the
 * control that confirms sits at the far end of the row**, with the way back
 * nearer, and nothing arms until the pointer has moved — a gaze still on the
 * bin cannot answer the question it raised (`holdDwellsUntilMoved`, called by
 * whoever opens it).
 */
/**
 * How far the pointer has to travel from where the bin was chosen before either
 * answer takes a rest or a click — five times the distance that says a pointer
 * was aimed somewhere new, because this one is a decision: a gaze still resting
 * where the bin was, or drifting off it, must not answer the question it raised.
 */
const ASK_FIRST_MOVE_PX = 120

/** What the question takes no notice of, whatever it lands on. */
const SWALLOWED = ['keyup', 'keypress', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'drop'] as const

export function AskFirst({
  title,
  note,
  confirm = 'Delete',
  onConfirm,
  onClose,
}: {
  title: string
  note: string
  /** What the far control says: Delete, Take out, Forget. */
  confirm?: string
  onConfirm: () => void
  onClose: () => void
}) {
  // **Neither answer arms until the pointer has gone a long way** from where it
  // chose the bin — in the commit that shows the question, so not even the
  // first frame of it answers a pointer that has not moved.
  useLayoutEffect(() => {
    cancelAllDwells()
    holdDwellsUntilMoved(ASK_FIRST_MOVE_PX)
  }, [])

  // **And nothing else is listened to until it is answered.** Every key is
  // taken before anything else sees it — Enter confirms and Escape keeps it,
  // the two a keyboard can say — and nothing is typed, pasted or dropped
  // anywhere. The pointer is held off by the scrim, which covers everything,
  // Peri's own keyboard included, and closes nothing when it is touched.
  const answers = useRef({ onConfirm, onClose })
  useLayoutEffect(() => {
    answers.current = { onConfirm, onClose }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (e.key === 'Enter') answers.current.onConfirm()
      else if (e.key === 'Escape') answers.current.onClose()
    }
    const swallow = (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    for (const type of SWALLOWED) window.addEventListener(type, swallow, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      for (const type of SWALLOWED) window.removeEventListener(type, swallow, true)
    }
  }, [])

  // Portalled, so it stands over everything whatever the screen is inside.
  return createPortal(
    <div className="edit-modal-scrim is-asking">
      <div className="edit-modal" role="alertdialog" aria-modal="true" aria-label={title.replace(/\?$/, '')}>
        <div className="edit-modal-title">{title}</div>
        <p className="edit-modal-note">{note}</p>
        <div className="edit-modal-actions is-confirming">
          <EditAction kind="cancel" label="Keep it" onActivate={onClose} armsOnceMoved />
          <EditAction kind="danger" label={confirm} onActivate={onConfirm} armsOnceMoved />
        </div>
      </div>
    </div>,
    document.body,
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
  // **Deleting asks first** — see `AskFirst`.
  if (name !== null) {
    const phrases = `${phraseCount} phrase${phraseCount === 1 ? '' : 's'}`
    return (
      <AskFirst
        title={`Delete ${name}?`}
        note={
          phraseCount > 0
            ? `Its ${phrases} stay${phraseCount === 1 ? 's' : ''} in Library, and in any other category ${phraseCount === 1 ? 'it is' : 'they are'} in.`
            : 'It has no phrases in it.'
        }
        onConfirm={onDelete}
        onClose={onClose}
      />
    )
  }
  return (
    <NameDialog
      title="Add category"
      placeholder="Category name…"
      fieldLabel="Category name"
      clashNote="A category is already called that."
      existing={existing}
      onSave={onSave}
      onClose={onClose}
    />
  )
}

/**
 * **A new emergency phrase, from the plus after the bar's last button** — in
 * every mode, as a category is added from the plus after the last tab. Its
 * words are typed here rather than in the message box: the plus that opened a
 * blank draft there changed nothing anybody could see, so it read as doing
 * nothing at all.
 */
export function EmergencyModal({
  existing,
  onSave,
  onClose,
}: {
  /** The words already on the bar, which a new button may not repeat. */
  existing: string[]
  onSave: (words: string) => void
  onClose: () => void
}) {
  return (
    <NameDialog
      title="Add emergency phrase"
      placeholder="What it says…"
      fieldLabel="Emergency phrase"
      clashNote="A button on the bar already says that."
      existing={existing}
      onSave={onSave}
      onClose={onClose}
    />
  )
}

/**
 * One line of words and Save: a category's name or an emergency button's
 * words. Focused on arrival, so typing works straight away; Enter saves and
 * Escape closes; and words already there, in any case, are refused.
 *
 * **Guarded against the press that opened it, said again.** A pointer rests
 * where it last fired, and an operating system's dwell-click goes on clicking
 * there: the screen round the dialog closed it when pressed, so the next click
 * where the plus had been closed it, and the one after opened it again. That
 * screen closes nothing now — Cancel and Escape do, as on every question here —
 * and nothing answers a rest or a click until the pointer is aimed somewhere
 * new, as the dialog comes and as it goes: what it uncovers, the plus or a
 * phrase under Save, is not chosen by the pointer that was resting there.
 */
function NameDialog({
  title,
  placeholder,
  fieldLabel,
  clashNote,
  existing,
  onSave,
  onClose,
}: {
  title: string
  placeholder: string
  fieldLabel: string
  clashNote: string
  existing: string[]
  onSave: (words: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()
  const clash = existing.some(c => c.trim().toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed !== '' && !clash

  useLayoutEffect(() => {
    cancelAllDwells()
    holdDwellsUntilMoved()
    return () => {
      cancelAllDwells()
      holdDwellsUntilMoved()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="edit-modal-scrim">
      <div className="edit-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="edit-modal-title">{title}</div>

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
          placeholder={placeholder}
          aria-label={fieldLabel}
          autoFocus
        />

        {clash && <p className="edit-modal-note">{clashNote}</p>}

        <div className="edit-modal-actions">
          <EditAction kind="cancel" label="Cancel" onActivate={onClose} />
          <EditAction kind="save" label="Save" onActivate={() => onSave(trimmed)} disabled={!canSave} />
        </div>
      </div>
    </div>
  )
}
