
// The red bar along the bottom. Always visible, on every screen of the app, and
// spoken the moment it is chosen rather than composed into the message first.

import { useCallback, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { speak } from '../voice/speech'
import { type Phrase } from '../core/phrases'
import { PlusIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'

function EmergencyButton({ phrase, voice }: { phrase: Phrase; voice?: string }) {
  const { settings } = useSettings()
  const { editMode, openEdit } = useEdit()
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
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
  }, [phrase, voice, editMode, openEdit, settings])

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

export function EmergencyBar({ phrases, voiceFor }: {
  phrases: Phrase[]
  voiceFor: (id: string) => string | undefined
}) {
  const { editMode } = useEdit()
  if (phrases.length === 0 && !editMode) return null
  return (
    <div className="emergency-bar" role="group" aria-label="Emergency phrases">
      {phrases.map(p => <EmergencyButton key={p.id} phrase={p} voice={voiceFor(p.id)} />)}
      {editMode && <EmergencyAddButton />}
    </div>
  )
}
