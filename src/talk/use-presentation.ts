// Presentation mode, from Peri's side: the window it opens, and the stage that
// window becomes for everything said — see `voice/speech.ts` (`Stage`) and
// docs/decisions/presentation-mode.md. The window's own page is
// `talk/presentation.tsx`.

import { useCallback, useEffect, useRef, useState } from 'react'
import { setStage, type Stage } from '../voice/speech'

/** Where the window's page is served — a screen of its own, chosen in `App.tsx`. */
export const PRESENTATION_PATH = '/presentation'

/** What the window says to Peri once it can be spoken through. */
export const STAGE_READY = 'peri:stage-ready'

/** The window, with the stage its page puts on itself. */
export interface PresentingWindow extends Window {
  periStage?: Stage
}

/**
 * **One window, opened and closed by the toggle beside please.** Opened rather
 * than drawn inside Peri, so it can be shared in a call on its own — what is
 * said, the camera and the audio, and none of the board.
 *
 * **Opening can be refused**, as a link can: a browser opens a window only off
 * the back of a press, and a dwell is none. `onBlocked` says so — and `onChange`
 * says it opened, or that it closed, from either side, as every mode says it
 * changed.
 *
 * The stage goes in when the window says it is ready, and comes out when the
 * window closes — from here, from its own side, or by Peri going away.
 */
export function usePresentation(onBlocked: () => void, onChange: (presenting: boolean) => void) {
  const [presenting, setPresenting] = useState(false)
  const popup = useRef<PresentingWindow | null>(null)

  const end = useCallback(() => {
    setStage(null)
    const w = popup.current
    popup.current = null
    setPresenting(false)
    if (w && !w.closed) w.close()
    if (w) onChange(false)
  }, [onChange])

  const start = useCallback(() => {
    const w = window.open(PRESENTATION_PATH, 'peri-presentation', 'popup,width=1280,height=720')
    if (!w) return onBlocked()
    popup.current = w
    setPresenting(true)
    onChange(true)
  }, [onBlocked, onChange])

  const toggle = useCallback(() => (popup.current ? end() : start()), [end, start])

  // Ready — and ready again, if it is reloaded.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const w = popup.current
      if (!w || e.source !== w || e.origin !== location.origin || e.data !== STAGE_READY) return
      setStage(stageIn(w))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Closed from its own side: a window says nothing as it goes, so it is asked.
  useEffect(() => {
    if (!presenting) return
    const timer = setInterval(() => {
      if (popup.current?.closed) end()
    }, 1000)
    return () => clearInterval(timer)
  }, [presenting, end])

  // Peri going away takes the window with it: a window left behind would show
  // what was said to a call nobody is speaking in any more.
  useEffect(() => {
    const leave = () => popup.current?.close()
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      setStage(null)
      leave()
    }
  }, [])

  return { presenting, toggle }
}

/**
 * The stage, reached through the window each time it is asked — never held —
 * so a window closed or reloaded under it is found out on the next word rather
 * than spoken into. `voice/speech.ts` takes a throw or a rejection as "here
 * instead".
 */
function stageIn(w: PresentingWindow): Stage {
  const there = () => {
    const stage = w.closed ? undefined : w.periStage
    if (!stage) throw new Error('The presentation window is gone')
    return stage
  }
  return {
    show: text => there().show(text),
    play: (url, volume, rate, onEnded) => {
      try {
        return there().play(url, volume, rate, onEnded)
      } catch (err) {
        return Promise.reject(err)
      }
    },
    stop: () => there().stop(),
  }
}
