
// The red bar along the bottom. Always visible, on every screen of the app, and
// spoken the moment it is chosen rather than composed into the message first.

import { useCallback, useState } from 'react'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { useEdit } from './edit-mode'
import { speak } from './speech'
import { type Phrase } from './phrases'
import { PlusIcon } from './icons'
import { cx, dwellVar } from './style'

function EmergencyButton({ phrase }: { phrase: Phrase }) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    if (editMode) {
      openEdit(phrase, true)
      return
    }
    speak(phrase.text, settings)
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }, [phrase, editMode, openEdit, settings])

  // Emergency phrases use the same dwell time as any other phrase. A shorter
  // fixed value would fire early for anyone who lengthened their dwell because
  // of tremor — exactly the users most likely to need this bar.
  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate)

  return (
    <div
      className={cx('emergency-btn', active && 'dwelling', flash && 'flashed', editMode && 'edit-mode')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={editMode ? `Edit emergency phrase: ${phrase.text}` : phrase.text}
      {...props}
    >
      <span className="emergency-label">{phrase.text}</span>
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function EmergencyAddButton() {
  const { settings } = useSettings()
  const { openEdit } = useEdit()
  const handleActivate = useCallback(() => openEdit(null, true), [openEdit])
  const { active, props } = useDwellControl(settings.actionDwellMs, handleActivate)
  return (
    <div
      className={cx('emergency-btn emergency-add', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label="Add emergency phrase"
      {...props}
    >
      <PlusIcon />
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function EmergencyBar({ phrases }: { phrases: Phrase[] }) {
  const { editMode } = useEdit()
  if (phrases.length === 0 && !editMode) return null
  return (
    <div className="emergency-bar" role="group" aria-label="Emergency phrases">
      {phrases.map(p => <EmergencyButton key={p.id} phrase={p} />)}
      {editMode && <EmergencyAddButton />}
    </div>
  )
}
