// Served at /speaking: **the last thing said, and nothing else** — the tab that
// is shared into a video call instead of the board. See `voice/relay.ts` and
// [Speaking into a call](../../docs/decisions/speaking-into-a-call.md).
//
// It plays what it is handed rather than anything of its own, so a call is sent
// the sound as a stream of the tab's rather than through a microphone that
// cancels it. And it has nothing to work: whoever shares it is looking at the
// board, and everybody else is looking at this.

import { useEffect, useRef, useState } from 'react'
import { cx } from '../ui/style'
import { serveSpeaking } from '../voice/relay'

/** Past this many characters the words are set smaller, so a long message still fits the screen. */
const LONG = 140
const LONGER = 400

export function SpeakingPage() {
  const [said, setSaid] = useState('')
  /** The browser would not play the last clip, and needs a click on this page first. */
  const [refused, setRefused] = useState(false)
  const playing = useRef<HTMLAudioElement | null>(null)

  // Named for the picker a call shows when somebody chooses a tab to share.
  useEffect(() => {
    document.title = 'Peri — speaking'
  }, [])

  useEffect(() => {
    const stop = () => {
      playing.current?.pause()
      playing.current = null
    }
    const close = serveSpeaking({
      show: setSaid,
      hush: stop,
      play: (clip, volume, rate) => {
        stop()
        const url = URL.createObjectURL(clip)
        const audio = new Audio(url)
        audio.volume = volume
        audio.playbackRate = rate
        audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
        playing.current = audio
        return audio.play().then(
          () => setRefused(false),
          (err: unknown) => {
            // Peri is told, and plays it itself — nothing goes unsaid. This only
            // asks for the click that lets the next one play here.
            URL.revokeObjectURL(url)
            setRefused(true)
            throw err
          },
        )
      },
    })
    // **A click is what lets a page play sound**, and a rest is not one. Once a
    // click has landed here the next clip plays, so the line asking goes.
    const clicked = () => setRefused(false)
    window.addEventListener('pointerdown', clicked)
    return () => {
      stop()
      close()
      window.removeEventListener('pointerdown', clicked)
    }
  }, [])

  return (
    <main className="speaking-page">
      <p className="speaking-name">Peri</p>
      <p
        className={cx(
          'speaking-said',
          !said && 'is-waiting',
          said.length > LONG && 'is-long',
          said.length > LONGER && 'is-longer',
        )}
        aria-live="polite"
      >
        {said || 'What Peri says will appear here.'}
      </p>
      {refused && (
        <p className="speaking-refused">Click this page once so it can play Peri&apos;s voice into the call.</p>
      )}
    </main>
  )
}
