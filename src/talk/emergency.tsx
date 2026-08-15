
// The red bar along the bottom. Always visible, on every screen of the app, and
// spoken the moment it is chosen rather than composed into the message first.
//
// Which button sits where matters more here than anywhere else: this is the one
// surface somebody reaches for without reading it, so the order it comes in is
// theirs to set. Reordering works exactly as it does for the category tabs —
// drag with a mouse, or hold one button and dwell where it should go — and both
// routes come from `ui/reorder`.

import { useCallback, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { speak } from '../voice/speech'
import { stripMarkdown } from '../core/markdown'
import { type Phrase } from '../core/phrases'
import { PlusIcon, ReorderIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { PhraseText } from './phrase-text'

function EmergencyButton({ phrase, voice, reorder }: {
  phrase: Phrase
  voice?: string
  /** Present only in reorder mode. */
  reorder?: ReorderProps
}) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    // Reordering takes precedence: while it is on, a button is a thing to move
    // rather than a thing to open — or, outside edit mode, to say.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    if (editMode) {
      openEdit(phrase, true)
      return
    }
    // Never waits on the network. A phrase given its own voice keeps it here,
    // because assigning one fetches and stores the audio — so it is already in
    // hand. Anything not in hand is said by the device this instant rather than
    // in the right voice a second and a half from now: "I can't breathe" does
    // not get to depend on the wifi.
    speak(phrase.text, settings, { voiceURI: voice, instant: true })
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }, [phrase, voice, editMode, openEdit, settings, reorder])

  // Emergency phrases use the same dwell time as any other phrase. A shorter
  // fixed value would fire early for anyone who lengthened their dwell because
  // of tremor — exactly the users most likely to need this bar.
  // The words, not the markup — see the grid cell for why.
  const spoken = stripMarkdown(phrase.text)

  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second button out from under the
    // one already in the pointer's hand.
    disabled: reorder?.dragging,
  })

  return (
    <div
      className={cx(
        'emergency-btn',
        active && 'dwelling',
        flash && 'flashed',
        editMode && !reorder && 'edit-mode',
        reorder && 'reorderable',
        reorder?.held && 'is-held',
        // Somewhere the held phrase could go — every other button, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={
        reorder
          ? reorderLabel(reorder, spoken, 'phrase')
          : editMode
            ? `Edit emergency phrase: ${spoken}`
            : spoken
      }
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder && (e => {
        // Without this the browser refuses the drop outright.
        e.preventDefault()
        reorder.onDragOver()
      })}
      onDragEnd={reorder?.onDragEnd}
      onDrop={reorder && (e => {
        e.preventDefault()
        reorder.onDrop()
      })}
      {...props}
    >
      <span className="emergency-label"><PhraseText segments={phrase.segments} /></span>
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

/** The controls at the end of the bar: add, and reorder. Edit mode only. */
function EmergencyTool({ className, label, pressed, disabled, onActivate, children }: {
  className: string
  label: string
  pressed?: boolean
  disabled?: boolean
  onActivate: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('emergency-btn emergency-tool', className, active && 'dwelling', pressed && 'is-on')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function EmergencyBar({ phrases, voiceFor, reordering, onToggleReorder, onReorder, onLift }: {
  phrases: Phrase[]
  voiceFor: (id: string) => string | undefined
  /** All of the below are edit-mode only. */
  reordering?: boolean
  onToggleReorder?: () => void
  onReorder?: (from: string, to: string) => void
  /** Announced when a phrase is picked up — the styling alone says nothing aloud. */
  onLift?: (text: string) => void
}) {
  const { editMode, openEdit } = useEdit()
  // A phrase is keyed by its id, so what it is called has to be looked up: two
  // buttons can read the same and an id survives rewording either of them.
  const labelOf = (id: string) => phrases.find(p => p.id === id)?.text ?? id
  const { propsFor, release } = useReorder({ onReorder, onLift, labelOf })

  // Switching the mode off puts down whatever was in the air. Without this the
  // phrase stays held across the round trip, and the next dwell drops the
  // forgotten one instead of lifting the button under the pointer.
  const toggleReorder = useCallback(() => {
    release()
    onToggleReorder?.()
  }, [release, onToggleReorder])

  const handleAdd = useCallback(() => openEdit(null, true), [openEdit])

  if (phrases.length === 0 && !editMode) return null

  // Two buttons in edit mode either way. Adding a phrase mid-reorder would drop
  // whatever is in the air, so the add button goes quiet rather than away — the
  // control a user has to find is the one that must not move.
  return (
    <div className="emergency-bar" role="group" aria-label="Emergency phrases">
      {phrases.map(p => (
        <EmergencyButton
          key={p.id}
          phrase={p}
          voice={voiceFor(p.id)}
          reorder={reordering ? propsFor(p.id) : undefined}
        />
      ))}
      {editMode && (
        <>
          <EmergencyTool
            className="emergency-add"
            label={reordering ? 'Finish reordering to add an emergency phrase' : 'Add emergency phrase'}
            disabled={reordering}
            onActivate={handleAdd}
          >
            <PlusIcon />
          </EmergencyTool>
          {onToggleReorder && (
            <EmergencyTool
              className="emergency-reorder"
              label={reordering ? 'Done reordering emergency phrases' : 'Reorder emergency phrases'}
              pressed={reordering}
              onActivate={toggleReorder}
            >
              <ReorderIcon />
            </EmergencyTool>
          )}
        </>
      )}
    </div>
  )
}
