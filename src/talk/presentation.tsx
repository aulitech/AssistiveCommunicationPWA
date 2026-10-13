// The presentation window's page — what `talk/use-presentation.ts` opens. A
// screen of its own, chosen in `App.tsx` by its address. See
// docs/decisions/presentation-mode.md.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isPresentationBackground, loadPresentationBackground } from '../core/store'
import { DwellButton } from '../ui/controls'
import { CameraIcon, MicIcon } from '../ui/icons'
import { useSettings } from '../ui/settings'
import { cx } from '../ui/style'
import { type Stage } from '../voice/speech'
import { STAGE_READY, type PresentingWindow } from './use-presentation'

/**
 * The microphone as a call app asks for it: what this window plays comes out
 * of the speakers and back into the microphone, and played out again that is
 * a howl. The browser's echo cancellation takes its own output back out.
 */
const MICROPHONE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

/**
 * How many things said are kept: the newest, large, and those before it,
 * scrolled up out of the band at the foot of the window as more is said.
 */
const SHOWN = 20

/**
 * **What is said, to whoever is watching** — shared in a call, or on a screen
 * turned towards the room. In the lower third of the window, as captions are:
 * the newest thing said large at the foot, what came before it smaller above,
 * **scrolled up as each new thing arrives** and fading as it goes; on this
 * device's own picture if it has one, and, a dwell away, the camera, as large
 * as the window allows without stretching it.
 *
 * It puts the stage on its own window and tells Peri it is ready. Audio played
 * through it plays here, so sharing this window shares the sound; one the
 * browser will not let play is played in Peri's window instead, and this says
 * so until the window has been selected once, which is what lets it play.
 *
 * **The microphone is a dwell away too**, with the camera or without it,
 * played out of this window beside Peri's voice — so a call or a recording of
 * the window carries the room and Peri together. With the browser's echo cancellation on,
 * since what this window plays reaches the microphone from the speakers.
 */
export function PresentationPage() {
  const { settings } = useSettings()
  const [said, setSaid] = useState<{ id: number; text: string }[]>([])
  const [background, setBackground] = useState(loadPresentationBackground)
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [cameraProblem, setCameraProblem] = useState('')
  const [soundElsewhere, setSoundElsewhere] = useState(false)
  const [microphone, setMicrophone] = useState<MediaStream | null>(null)
  const [microphoneProblem, setMicrophoneProblem] = useState('')
  /** The microphone is open but the browser will not play it until the window is pressed in. */
  const [microphoneWaiting, setMicrophoneWaiting] = useState(false)
  const heard = useRef<HTMLAudioElement>(null)
  const playing = useRef<HTMLAudioElement | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const band = useRef<HTMLDivElement>(null)

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
    const pressed = () => {
      setSoundElsewhere(false)
      // The press that lets this window play is the moment to start the microphone.
      if (heard.current?.srcObject) {
        heard.current.play().then(
          () => setMicrophoneWaiting(false),
          () => {},
        )
      }
    }
    window.addEventListener('pointerdown', pressed)
    return () => window.removeEventListener('pointerdown', pressed)
  }, [])

  useEffect(() => {
    if (video.current) video.current.srcObject = camera
    return () => camera?.getTracks().forEach(t => t.stop())
  }, [camera])

  /** Plays the microphone out of this window — or says it is waiting on a press to. */
  const playMicrophone = useCallback((stream: MediaStream) => {
    const out = heard.current
    if (!out) return
    out.srcObject = stream
    out.play().then(
      () => setMicrophoneWaiting(false),
      () => setMicrophoneWaiting(true),
    )
  }, [])

  /** Lets the microphone go: nothing more played, and stopped by the effect below. */
  const releaseMicrophone = useCallback(() => {
    const out = heard.current
    if (out) out.srcObject = null
    setMicrophone(null)
    setMicrophoneWaiting(false)
  }, [])

  // Stopped whenever it is let go — and on the way out, so a closed window
  // leaves no microphone open.
  useEffect(() => () => microphone?.getTracks().forEach(t => t.stop()), [microphone])

  const toggleMicrophone = useCallback(() => {
    if (microphone) return releaseMicrophone()
    setMicrophoneProblem('')
    if (!navigator.mediaDevices?.getUserMedia) return setMicrophoneProblem('This browser offers no microphone.')
    navigator.mediaDevices.getUserMedia({ audio: MICROPHONE, video: false }).then(
      stream => {
        setMicrophone(stream)
        playMicrophone(stream)
      },
      () =>
        setMicrophoneProblem('The microphone could not be opened. Allow Peri to use it in your browser settings.'),
    )
  }, [microphone, releaseMicrophone, playMicrophone])

  const toggleCamera = useCallback(() => {
    // The microphone is its own: it stays on or off whatever the camera does.
    if (camera) return setCamera(null)
    setCameraProblem('')
    if (!navigator.mediaDevices?.getUserMedia) return setCameraProblem('This browser offers no camera.')
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(setCamera, () =>
        setCameraProblem('The camera could not be opened. Allow Peri to use it in your browser settings.'),
      )
  }, [camera])

  // Each new thing said scrolls what came before up and out of the band —
  // smoothly, unless somebody has asked for less motion (the stylesheet's).
  useEffect(() => {
    const box = band.current
    if (box) box.scrollTop = box.scrollHeight
  }, [said])

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
      {/* The microphone, played out of this window beside Peri's voice. */}
      <audio ref={heard} className="presentation-heard" />
      <div ref={band} className="presentation-said" aria-live="polite">
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
        {microphoneWaiting && (
          <p className="presentation-note">Select this window once to play the microphone here.</p>
        )}
        {microphoneProblem && <p className="presentation-note">{microphoneProblem}</p>}
        <DwellButton
          className={cx('presentation-mic-toggle', microphone && 'active')}
          onSelect={toggleMicrophone}
          label={microphone ? 'Turn the microphone off' : 'Mix in the microphone'}
          durationMs={settings.actionDwellMs}
        >
          <MicIcon />
        </DwellButton>
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
