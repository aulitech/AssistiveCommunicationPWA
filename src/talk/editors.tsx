
// The two dialogs that change what is in the grid: one for a phrase, one for a
// category. Mostly typed rather than dwelled — they are set-up work, usually
// done by whoever configures the device.
//
// The one part that is not is the caret. Somebody driving this by gaze already
// has a keyboard of their own; what no keyboard supplies is a way to say
// *where* in the phrase to type, because that has always taken a click. So the
// phrase text answers to a dwell of its own, which puts the caret under the
// pointer — see `ui/caret`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useCaretDwell } from '../ui/caret'
import { useLinkInput, type PasteResult } from '../ui/link-input'
import { useSettings } from '../ui/settings'
import { compose, parseSegments, type Phrase } from '../core/phrases'
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

export function EditModal({ phrase, isEmergency, initialText, allCategories, voice, recent, keeping, onSave, onDelete, onClose, onPasted }: {
  phrase: Phrase | null
  isEmergency: boolean
  /** Seeds a new phrase — the composed message, when adding from the message box. */
  initialText?: string
  allCategories: string[]
  /** The voice this phrase already carries, if any. */
  voice?: string
  /**
   * Where a new phrase starts, from the last one filed. Only ever a starting
   * point: a phrase that already has a category or a voice shows its own, so
   * opening one to fix a typo cannot quietly refile it or change how it sounds.
   */
  recent?: { category?: string; voice?: string }
  /**
   * The phrase is a message already said. Saving keeps it as a phrase of the
   * user's own; deleting forgets having said it. Neither edits anything, so the
   * dialog says what it will do rather than "Edit phrase".
   */
  keeping?: boolean
  onSave: (text: string, category: string, voice: string | undefined) => void
  onDelete: () => void
  onClose: () => void
  /** Says what came of asking the clipboard, so the screen can report a refusal. */
  onPasted: (result: PasteResult) => void
}) {
  // The source, not the display text. `text` has had its slots resolved into
  // labels — "red/blue" — and saving that back flattens the slot for good.
  const { settings } = useSettings()
  const [text, setText] = useState(phrase?.source ?? initialText ?? '')
  const textRef = useRef<HTMLTextAreaElement>(null)

  // The same dwell the message box uses. Both boxes need the caret placed the
  // same way, so how it is done lives in `ui/caret` rather than here.
  const caret = useCaretDwell(textRef, settings.actionDwellMs)

  // A link pasted or dropped into the phrase becomes `[label](url)`, so the
  // button reads as the page's name rather than as forty characters of address.
  const linkInput = useLinkInput(
    textRef,
    useCallback((next: string, caret: number) => {
      setText(next)
      const el = textRef.current
      if (!el) return
      // After the value React is about to render, or the caret lands in the old
      // one and jumps to the end.
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = caret
        el.focus()
      }, 0)
    }, []),
  )
  const paste = useCallback(() => {
    void linkInput.pasteFromClipboard().then(onPasted)
  }, [linkInput, onPasted])

  // A phrase whose category is not one of the real ones — a sent message — has
  // to land somewhere the user actually keeps things, and the likeliest
  // somewhere is wherever the last one went.
  const [category, setCategory] = useState(() => {
    if (phrase && allCategories.includes(phrase.category)) return phrase.category
    if (recent?.category && allCategories.includes(recent.category)) return recent.category
    return allCategories[0] ?? ''
  })
  const [creatingCategory, setCreatingCategory] = useState(false)
  const isNew = phrase === null
  // A brand-new category needs a name before the phrase can be filed under it.
  const canSave = text.trim().length > 0 && (isEmergency || category.trim().length > 0)

  const [chosenVoice, setChosenVoice] = useState(voice ?? (phrase ? '' : (recent?.voice ?? '')))
  // What the phrase reads as. `text` is what it is *written* as, brackets and
  // all, and the picker speaks a sample of it the moment a voice is chosen —
  // nobody wants to hear "open curly bracket, quote, right, quote" read out,
  // least of all charged to an account by the character.
  const spokenText = useMemo(() => compose(parseSegments(text)), [text])

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
          ref={textRef}
          className={cx('edit-modal-text', caret.active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          // Pointer handlers only — the hook hands back no others, since the
          // dwell primitive's Enter/Space handling on a box people type into
          // would swallow the first space typed.
          {...caret.props}
          value={text}
          onChange={e => setText(e.target.value)}
          onPaste={linkInput.onPaste}
          onDrop={linkInput.onDrop}
          onDragOver={linkInput.onDragOver}
          placeholder="Phrase text…"
          aria-label="Phrase text"
          autoFocus
          rows={3}
        />

        {/* Under the box rather than beside the Save row: it acts on the text,
            not on the dialog, and a pointer travelling to it should not cross
            Delete on the way. The keyboard route in here is Ctrl-V, which is
            the input this whole app exists without. */}
        <div className="edit-modal-tools">
          <EditAction kind="cancel" label="Paste" onActivate={paste} />
        </div>

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
            sampleText={spokenText}
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
