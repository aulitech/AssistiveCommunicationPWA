// The presentation window's page — what `talk/use-presentation.ts` opens. A
// screen of its own, chosen in `App.tsx` by its address. See
// docs/decisions/presentation-mode.md.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isPresentationBackground, loadPresentationBackground } from '../core/store'
import { DwellButton } from '../ui/controls'
import { CameraIcon } from '../ui/icons'
import { useSettings } from '../ui/settings'
import { cx } from '../ui/style'
import { type Stage } from '../voice/speech'
import { STAGE_READY, type PresentingWindow } from './use-presentation'

/** How many things said stay on screen: the newest, large, and those before it. */
const SHOWN = 4

/**
 * **What is said, to whoever is watching** — shared in a call, or on a screen
 * turned towards the room. The newest thing said large in the middle, the few
 * before it smaller above, on this device's own picture if it has one; and, a
 * dwell away, the camera, as large as the window allows without stretching it,
 * with the words over its foot.
 *
 * It puts the stage on its own window and tells Peri it is ready. Audio played
 * through it plays here, so sharing this window shares the sound; one the
 * browser will not let play is played in Peri's window instead, and this says
 * so until the window has been selected once, which is what lets it play.
 */
export function PresentationPage() {
  const { settings } = useSettings()
  const [said, setSaid] = useState<{ id: number; text: string }[]>([])
  const [background, setBackground] = useState(loadPresentationBackground)
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [cameraProblem, setCameraProblem] = useState('')
  const [soundElsewhere, setSoundElsewhere] = useState(false)
  const playing = useRef<HTMLAudioElement | null>(null)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    document.title = 'Peri — presentation'
    let next = 0
    const stage: Stage = {
      show: text => setSaid(s => [...s.slice(1 - SHOWN), { id: next++, text }]),
      play: (url, volume, rate, onEnded) => {
        playing.current?.pause()
        const audio = new Audio(url)
        audio.volume = volume
        audio.playbackRate = rate
        audio.addEventListener('ended', onEnded, { once: true })
        playing.current = audio
        return audio.play().then(
          () => setSoundElsewhere(false),
          (err: unknown) => {
            setSoundElsewhere(true)
            throw err
          },
        )
      },
      stop: () => {
        playing.current?.pause()
        playing.current = null
      },
    }
    const self = window as PresentingWindow
    self.periStage = stage
    window.opener?.postMessage(STAGE_READY, location.origin)
    return () => {
      delete self.periStage
    }
  }, [])

  // A picture chosen in Settings while this is open is shown at once.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (isPresentationBackground(e.key)) setBackground(loadPresentationBackground())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Selecting the window is what lets it play — a browser plays sound only in a
  // window somebody has pressed in.
  useEffect(() => {
    const pressed = () => setSoundElsewhere(false)
    window.addEventListener('pointerdown', pressed)
    return () => window.removeEventListener('pointerdown', pressed)
  }, [])

  useEffect(() => {
    if (video.current) video.current.srcObject = camera
    return () => camera?.getTracks().forEach(t => t.stop())
  }, [camera])

  const toggleCamera = useCallback(() => {
    if (camera) return setCamera(null)
    setCameraProblem('')
    if (!navigator.mediaDevices?.getUserMedia) return setCameraProblem('This browser offers no camera.')
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(setCamera, () =>
        setCameraProblem('The camera could not be opened. Allow Peri to use it in your browser settings.'),
      )
  }, [camera])

  const latest = said[said.length - 1]
  // The camera is the picture while it is on: the background showing round it
  // would be two pictures competing, and the face is the one being watched.
  const behind = camera ? '' : background
  return (
    <div
      className={cx('presentation', camera && 'has-camera', behind && 'has-background')}
      style={behind ? { backgroundImage: `url("${behind}")` } : undefined}
    >
      {camera && <video ref={video} className="presentation-camera" autoPlay muted playsInline />}
      <div className="presentation-said" aria-live="polite">
        {said.length === 0 && <p className="presentation-waiting">What Peri says appears here.</p>}
        {said.slice(0, -1).map(s => (
          <p key={s.id} className="presentation-earlier">
            {s.text}
          </p>
        ))}
        {latest && (
          <p key={latest.id} className="presentation-latest">
            {latest.text}
          </p>
        )}
      </div>
      <div className="presentation-tools">
        {soundElsewhere && (
          <p className="presentation-note">
            Sound is playing from Peri’s own window. Select this window once to play it here.
          </p>
        )}
        {cameraProblem && <p className="presentation-note">{cameraProblem}</p>}
        <DwellButton
          className={cx('presentation-camera-toggle', camera && 'active')}
          onSelect={toggleCamera}
          label={camera ? 'Hide the camera' : 'Show the camera'}
          durationMs={settings.actionDwellMs}
        >
          <CameraIcon />
        </DwellButton>
      </div>
    </div>
  )
}
